
const SPORTScore_URL = 'https://sportscore.com/api/v1/fixtures/';
const THESPORTSDB_URL = 'https://www.thesportsdb.com/api/v1/json/123';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getStatus(status = '', description = '') {
  const value = `${status} ${description}`.toLowerCase();

  if (/finished|complete|full.?time|\bft\b/.test(value)) {
    return 'Match Finished';
  }
  if (/live|in.?progress|half.?time|\bht\b|playing/.test(value)) {
    return 'In Progress';
  }
  if (/postponed|cancelled|abandoned|suspended/.test(value)) {
    return 'Match Postponed';
  }
  return 'Not Started';
}

function formatTime(value) {
  if (!value) return 'Heure non communiquée';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Heure non communiquée';

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Brazzaville'
  });
}

function normalizeSportScore(match, date) {
  const status = getStatus(match.status, match.status_text);

  return {
    idEvent: String(match.id ?? match.fixture_id ??
      `${match.home}-${match.away}-${match.time ?? date}`),
    strHomeTeam: match.home || 'Équipe inconnue',
    strAwayTeam: match.away || 'Équipe inconnue',
    strHomeTeamBadge: match.home_logo || '',
    strAwayTeamBadge: match.away_logo || '',
    strLeague: match.competition || 'Compétition non précisée',
    strCountry: match.country || '',
    strVenue: match.venue || '',
    strTime: formatTime(match.time),
    dateEvent: date,
    intHomeScore: status !== 'Not Started' ? toNumber(match.home_score) : null,
    intAwayScore: status !== 'Not Started' ? toNumber(match.away_score) : null,
    strStatus: status,
    strSource: 'SportScore',
    competition_logo: match.competition_logo || '',
    strTheSportsDBId: ''
  };
}

function normalizeTheSportsDB(event) {
  const status = getStatus(event.strStatus || '');

  return {
    ...event,
    idEvent: String(event.idEvent || ''),
    strTheSportsDBId: String(event.idEvent || ''),
    strTime: formatTime(
      event.strTimestamp ||
      `${event.dateEvent || ''}T${event.strTime || '00:00:00'}`
    ),
    intHomeScore: status !== 'Not Started' ? toNumber(event.intHomeScore) : null,
    intAwayScore: status !== 'Not Started' ? toNumber(event.intAwayScore) : null,
    strStatus: status,
    strSource: 'TheSportsDB'
  };
}

function matchKey(event) {
  return `${event.strHomeTeam}|${event.strAwayTeam}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API HTTP ${response.status}`);
  }

  return response.json();
}

async function getMatchDetails(eventId) {
  const id = String(eventId || '');

  if (!/^\d+$/.test(id)) {
    return Response.json(
      { message: 'Identifiant TheSportsDB invalide.' },
      { status: 400 }
    );
  }

  const endpoints = [
    `lookupevent.php?id=${id}`,
    `lookuptimeline.php?id=${id}`,
    `lookuplineup.php?id=${id}`,
    `lookupeventstats.php?id=${id}`
  ];

  const results = await Promise.allSettled(
    endpoints.map(path => fetchJSON(`${THESPORTSDB_URL}/${path}`))
  );

  const getResult = index =>
    results[index].status === 'fulfilled'
      ? results[index].value
      : null;

  const eventData = getResult(0);
  const timelineData = getResult(1);
  const lineupData = getResult(2);
  const statsData = getResult(3);

  const event = eventData?.events?.[0] || null;
  const timeline = timelineData?.timeline || [];
  const lineup = lineupData?.lineup || [];
  const statistics = statsData?.eventstats || [];

  return Response.json({
    source: 'TheSportsDB',
    event,
    timeline,
    lineup,
    statistics,
    available: {
      event: !!event,
      timeline: Array.isArray(timeline) && timeline.length > 0,
      lineup: Array.isArray(lineup) && lineup.length > 0,
      statistics: Array.isArray(statistics) && statistics.length > 0
    }
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300'
    }
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  // Récupération des détails d'un match
  const eventId = url.searchParams.get('eventId');

  if (eventId) {
    try {
      return await getMatchDetails(eventId);
    } catch (error) {
      return Response.json(
        { message: 'Impossible de récupérer les détails du match.' },
        { status: 502 }
      );
    }
  }

  // Récupération des rencontres par date
  const rawDate = url.searchParams.get('date') || '';
  const date = rawDate.replace(/[\u200B-\u200D\u2060\uFEFF\s]/g, '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { message: 'Date invalide. Format attendu : AAAA-MM-JJ.' },
      { status: 400 }
    );
  }

  const requests = await Promise.allSettled([
    fetchJSON(
      `${SPORTScore_URL}?sport=football&date=${encodeURIComponent(date)}&limit=200`
    ).then(data => {
      if (!Array.isArray(data.matches)) {
        throw new Error('Réponse SportScore invalide');
      }

      return data.matches.map(match => normalizeSportScore(match, date));
    }),

    fetchJSON(
      `${THESPORTSDB_URL}/eventsday.php?d=${encodeURIComponent(date)}&s=Soccer`
    ).then(data => {
      return (data.events || [])
        .filter(event => event.strSport === 'Soccer')
        .map(normalizeTheSportsDB);
    })
  ]);

  const sportScoreOK = requests[0].status === 'fulfilled';
  const sportsDBOK = requests[1].status === 'fulfilled';

  if (!sportScoreOK && !sportsDBOK) {
    return Response.json(
      { message: 'Les sources de matchs sont temporairement indisponibles.' },
      { status: 502 }
    );
  }

  const events = new Map();

  if (sportScoreOK) {
    for (const event of requests[0].value) {
      events.set(matchKey(event), event);
    }
  }

  if (sportsDBOK) {
    for (const event of requests[1].value) {
      const key = matchKey(event);

      if (events.has(key)) {
        const existing = events.get(key);

        events.set(key, {
          ...event,
          ...existing,
          strTheSportsDBId: event.idEvent,
          strSource: 'SportScore + TheSportsDB'
        });
      } else {
        events.set(key, event);
      }
    }
  }

  const result = Array.from(events.values());

  return Response.json({
    source: 'SportScore + TheSportsDB',
    date,
    count: result.length,
    sources: {
      sportScore: sportScoreOK,
      theSportsDB: sportsDBOK
    },
    events: result
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300'
    }
  });
}


