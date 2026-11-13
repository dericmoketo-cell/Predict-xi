
const SPORTScore_URL = 'https://sportscore.com/api/v1/fixtures/';
const THESPORTSDB_URL = 'https://www.thesportsdb.com/api/v1/json/123';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeStatus(status = '', statusText = '') {
  const value = `${status} ${statusText}`.toLowerCase();

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

function localTime(value) {
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
  const status = normalizeStatus(match.status, match.status_text);
  const finished = status === 'Match Finished';
  const live = status === 'In Progress';

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
    strTime: localTime(match.time),
    dateEvent: date,
    intHomeScore: finished || live ? toNumber(match.home_score) : null,
    intAwayScore: finished || live ? toNumber(match.away_score) : null,
    strStatus: status,
    strSource: 'SportScore',
    competition_logo: match.competition_logo || ''
  };
}

function normalizeTheSportsDB(event) {
  const status = normalizeStatus(event.strStatus || '', '');
  const finished = status === 'Match Finished';
  const live = status === 'In Progress';

  return {
    ...event,
    idEvent: String(event.idEvent || ''),
    strTime: localTime(
      event.strTimestamp || `${event.dateEvent || ''}T${event.strTime || '00:00:00'}`
    ),
    intHomeScore: finished || live ? toNumber(event.intHomeScore) : null,
    intAwayScore: finished || live ? toNumber(event.intAwayScore) : null,
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

export default async (req) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return Response.json(
      { message: 'Date invalide. Format attendu : AAAA-MM-JJ.' },
      { status: 400 }
    );
  }

  const sportScoreRequest = fetch(
    `${SPORTScore_URL}?sport=football&date=${encodeURIComponent(date)}&limit=200`,
    { headers: { accept: 'application/json' } }
  ).then(async response => {
    if (!response.ok) {
      throw new Error(`SportScore HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data.matches)) {
      throw new Error('Format de réponse SportScore inattendu.');
    }

    return data.matches.map(match => normalizeSportScore(match, date));
  });

  const sportsDbRequest = fetch(
    `${THESPORTSDB_URL}/eventsday.php?d=${encodeURIComponent(date)}&s=Soccer`,
    { headers: { accept: 'application/json' } }
  ).then(async response => {
    if (!response.ok) {
      throw new Error(`TheSportsDB HTTP ${response.status}`);
    }

    const data = await response.json();

    return (data.events || [])
      .filter(event => event.strSport === 'Soccer')
      .map(normalizeTheSportsDB);
  });

  const [sportScoreResult, sportsDbResult] = await Promise.allSettled([
    sportScoreRequest,
    sportsDbRequest
  ]);

  const sportScoreEvents = sportScoreResult.status === 'fulfilled'
    ? sportScoreResult.value
    : [];

  const sportsDbEvents = sportsDbResult.status === 'fulfilled'
    ? sportsDbResult.value
    : [];

  if (
    sportScoreResult.status === 'rejected' &&
    sportsDbResult.status === 'rejected'
  ) {
    return Response.json(
      {
        message: 'Les deux sources de matchs sont temporairement indisponibles.'
      },
      { status: 502 }
    );
  }

  const eventsByKey = new Map();

  // SportScore est prioritaire.
  for (const event of sportScoreEvents) {
    eventsByKey.set(matchKey(event), event);
  }

  // TheSportsDB complète les rencontres manquantes.
  for (const event of sportsDbEvents) {
    const key = matchKey(event);

    if (!eventsByKey.has(key)) {
      eventsByKey.set(key, event);
    }
  }

  const events = Array.from(eventsByKey.values());

  return Response.json(
    {
      source: 'SportScore + TheSportsDB',
      date,
      count: events.length,
      sources: {
        sportScore: sportScoreResult.status === 'fulfilled',
        theSportsDB: sportsDbResult.status === 'fulfilled'
      },
      events
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300'
      }
    }
  );
};

