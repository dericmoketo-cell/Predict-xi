
const API_BASE = "https://v3.football.api-sports.io";

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

async function apiFootball(path, key) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-apisports-key": key
    }
  });

  if (!response.ok) {
    throw new Error(`API-Football : erreur HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(JSON.stringify(data.errors));
  }

  return data.response || [];
}

function normalizeFixture(item) {
  const fixture = item.fixture || {};
  const league = item.league || {};
  const home = item.teams?.home || {};
  const away = item.teams?.away || {};

  return {
    idEvent: String(fixture.id || ""),
    strTheSportsDBId: "",
    strEvent: `${home.name || "Équipe domicile"} - ${away.name || "Équipe extérieure"}`,
    strHomeTeam: home.name || "",
    strAwayTeam: away.name || "",
    strHomeTeamBadge: home.logo || "",
    strAwayTeamBadge: away.logo || "",
    dateEvent: fixture.date ? fixture.date.slice(0, 10) : "",
    strTime: fixture.date ? fixture.date.slice(11, 16) : "",
    strLeague: league.name || "",
    strCountry: league.country || "",
    intHomeScore: item.goals?.home ?? null,
    intAwayScore: item.goals?.away ?? null,
    strStatus: fixture.status?.long || "",
    strStatusShort: fixture.status?.short || "",
    strVenue: fixture.venue?.name || "",
    source: "API-Football",
    raw: item
  };
}

async function oldSources(date) {
  const results = await Promise.allSettled([
    fetch(
      `https://sportscore.com/api/v1/fixtures/?sport=football&date=${date}&limit=200`
    ).then(r => r.ok ? r.json() : null),

    fetch(
      `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&s=Soccer`
    ).then(r => r.ok ? r.json() : null)
  ]);

  const sportScore =
    results[0].status === "fulfilled" ? results[0].value : null;

  const sportsDb =
    results[1].status === "fulfilled" ? results[1].value : null;

  const events = [
    ...(Array.isArray(sportScore?.events) ? sportScore.events : []),
    ...(Array.isArray(sportsDb?.events) ? sportsDb.events : [])
  ];

  const seen = new Set();

  return events.filter(event => {
    const home = normalize(
      event.strHomeTeam || event.home || event.homeTeam || ""
    );
    const away = normalize(
      event.strAwayTeam || event.away || event.awayTeam || ""
    );

    const key = `${home}-${away}`;

    if (!home || !away || seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

async function findFixture(params, key) {
  const id = params.get("eventId");

  if (id && /^\d+$/.test(id)) {
    const result = await apiFootball(`/fixtures?id=${id}`, key);
    return result[0] || null;
  }

  const date = params.get("date");
  const home = normalize(params.get("home") || "");
  const away = normalize(params.get("away") || "");

  if (!date || !home || !away) return null;

  const fixtures = await apiFootball(
    `/fixtures?date=${date}`,
    key
  );

  return fixtures.find(item => {
    const h = normalize(item.teams?.home?.name || "");
    const a = normalize(item.teams?.away?.name || "");

    return (h === home && a === away) ||
           (h === away && a === home);
  }) || null;
}

async function matchDetails(fixture, key) {
  const id = fixture.fixture.id;

  const results = await Promise.allSettled([
    apiFootball(`/fixtures/events?fixture=${id}`, key),
    apiFootball(`/fixtures/lineups?fixture=${id}`, key),
    apiFootball(`/fixtures/statistics?fixture=${id}`, key)
  ]);

  const timeline =
    results[0].status === "fulfilled" ? results[0].value : [];

  const lineups =
    results[1].status === "fulfilled" ? results[1].value : [];

  const statistics =
    results[2].status === "fulfilled" ? results[2].value : [];

  const event = normalizeFixture(fixture);

  return {
    source: "API-Football",
    event,
    timeline: timeline.map(item => ({
      ...item,
      strTime: item.time?.elapsed != null
        ? `${item.time.elapsed}'`
        : "",
      strPlayer: item.player?.name || "",
      strAssist: item.assist?.name || "",
      strEvent: item.detail || item.type || "",
      strType: item.type || "",
      strDetail: item.detail || "",
      strTeam: item.team?.name || ""
    })),
    lineup: lineups,
    statistics,
    availability: {
      events: timeline.length > 0,
      lineups: lineups.length > 0,
      statistics: statistics.length > 0
    }
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const date = params.get("date");

  const key = env.API_FOOTBALL_KEY;

  if (!key) {
    return Response.json(
      { error: "Clé API_FOOTBALL_KEY absente dans Cloudflare." },
      { status: 500 }
    );
  }

  try {
    if (params.has("eventId") || (
      params.has("home") && params.has("away") && date
    )) {
      const fixture = await findFixture(params, key);

      if (!fixture) {
        return Response.json({
          source: "API-Football",
          error: "Match introuvable dans API-Football.",
          event: null,
          timeline: [],
          lineup: [],
          statistics: [],
          availability: {
            events: false,
            lineups: false,
            statistics: false
          }
        });
      }

      return Response.json(await matchDetails(fixture, key));
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
      return Response.json(
        { message: "Date invalide. Format attendu : AAAA-MM-JJ." },
        { status: 400 }
      );
    }

    try {
      const fixtures = await apiFootball(
        `/fixtures?date=${date}`,
        key
      );

      return Response.json({
        sport: "football",
        date,
        count: fixtures.length,
        source: "API-Football",
        sources: {
          apiFootball: true,
          sportScore: false,
          theSportsDB: false
        },
        events: fixtures.map(normalizeFixture)
      });
    } catch (apiError) {
      const oldEvents = await oldSources(date);

      if (oldEvents.length) {
        return Response.json({
          sport: "football",
          date,
          count: oldEvents.length,
          source: "Sources de secours",
          sources: {
            apiFootball: false,
            sportScore: true,
            theSportsDB: true
          },
          warning: apiError.message,
          events: oldEvents
        });
      }

      throw apiError;
    }
  } catch (error) {
    return Response.json(
      {
        error: "Impossible de charger les données football.",
        details: error.message
      },
      { status: 502 }
    );
  }
}

