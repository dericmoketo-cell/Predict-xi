const API_BASE = "https://v3.football.api-sports.io";
const TZ = "Africa/Brazzaville";

/* Durée maximale de conservation d'une copie (7 jours) */
const STORE_SECONDS = 7 * 24 * 3600;

/* Durées de fraîcheur, en secondes */
const TODAY_TTL = 600;        // aujourd'hui : 10 minutes
const FUTURE_TTL = 10800;     // dates à venir : 3 heures
const LIVE_DETAIL_TTL = 120;  // match en direct : 2 minutes
const UPCOMING_DETAIL_TTL = 1800; // match à venir : 30 minutes
const NEAR_KICKOFF_TTL = 300;     // match dans moins de 3 h : 5 minutes
const STANDINGS_TTL = 21600;      // classement : 6 heures

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/* Erreur avec un type : rate (quota), plan (date non autorisée), http, api */
class ApiError extends Error {
  constructor(message, kind = "api") {
    super(message);
    this.kind = kind;
  }
}

function friendlyMessage(error) {
  if (error.kind === "rate") {
    return "Limite de requêtes API-Football atteinte (quota gratuit). Réessaie plus tard.";
  }
  if (error.kind === "plan") {
    return `La formule gratuite d'API-Football n'autorise pas cette date : ${error.message}`;
  }
  return "Source temporairement indisponible.";
}

const dayOf = ms =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });

/* ---------- MÉMOIRE (CACHE) ---------- */

const cacheUrl = name => `https://predict-xi.cache/${name}`;

async function cacheRead(name) {
  try {
    const response = await caches.default.match(cacheUrl(name));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function cacheWrite(name, data) {
  try {
    const entry = { savedAt: Date.now(), data };
    await caches.default.put(
      cacheUrl(name),
      new Response(JSON.stringify(entry), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${STORE_SECONDS}`
        }
      })
    );
  } catch {
    /* si la mémoire échoue, l'application continue de fonctionner */
  }
}

function listIsFresh(entry, date) {
  const today = dayOf(Date.now());
  const age = (Date.now() - entry.savedAt) / 1000;

  /* Jour passé : copie valable si elle a été faite après la fin de ce jour */
  if (date < today) return dayOf(entry.savedAt) > date;
  if (date === today) return age < TODAY_TTL;
  return age < FUTURE_TTL;
}

const FINISHED = ["FT", "AET", "PEN"];
const LIVE = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"];

function detailIsFresh(entry) {
  const short = entry.data?.event?.strStatusShort || "";
  const age = (Date.now() - entry.savedAt) / 1000;

  if (FINISHED.includes(short)) return true;
  if (LIVE.includes(short)) return age < LIVE_DETAIL_TTL;

  const start = Date.parse(entry.data?.event?.isoDate || "");

  if (!Number.isNaN(start) && start - Date.now() < 3 * 3600 * 1000) {
    return age < NEAR_KICKOFF_TTL;
  }

  return age < UPCOMING_DETAIL_TTL;
}

/* ---------- API-FOOTBALL ---------- */

async function apiFootball(path, key) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-apisports-key": key
    }
  });

  if (response.status === 429) {
    throw new ApiError("API-Football : erreur HTTP 429", "rate");
  }

  if (!response.ok) {
    throw new ApiError(
      `API-Football : erreur HTTP ${response.status}`,
      "http"
    );
  }

  const data = await response.json();
  const errors = data.errors;

  if (errors && Object.keys(errors).length) {
    const kind =
      errors.rateLimit || errors.requests ? "rate" :
      errors.plan ? "plan" : "api";

    const text = errors.plan || errors.rateLimit || errors.requests ||
      JSON.stringify(errors);

    throw new ApiError(String(text), kind);
  }

  return data.response || [];
}

/* Demande les matchs en heure de Brazzaville.
   Si l'API refuse le fuseau, on retombe sur l'heure universelle (tz = "UTC"). */
async function fixturesQuery(path, key) {
  try {
    const rows = await apiFootball(
      `${path}&timezone=${encodeURIComponent(TZ)}`,
      key
    );
    return { rows, tz: TZ };
  } catch (error) {
    if (error.kind === "api" && /timezone/i.test(error.message)) {
      const rows = await apiFootball(path, key);
      return { rows, tz: "UTC" };
    }
    throw error;
  }
}

function normalizeFixture(item, tz = "UTC") {
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
    isoDate: fixture.date || "",
    strTimezone: tz,
    strRound: league.round || "",
    strReferee: fixture.referee || "",
    strCity: fixture.venue?.city || "",
    intLeagueId: league.id ?? null,
    intSeason: league.season ?? null,
    intHomeId: home.id ?? null,
    intAwayId: away.id ?? null,
    intElapsed: fixture.status?.elapsed ?? null,
    halftime: item.score?.halftime || null,
    extratime: item.score?.extratime || null,
    penalty: item.score?.penalty || null,
    source: "API-Football",
    raw: item
  };
}

/* Sources de secours : utilisées seulement en dernier recours */
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
    const { rows, tz } = await fixturesQuery(`/fixtures?id=${id}`, key);
    const fixture = rows[0] || null;

    /* Sécurité : l'identifiant doit correspondre aux équipes demandées.
       Les matchs des sources de secours ont d'autres identifiants. */
    const home = normalize(params.get("home") || "");
    const away = normalize(params.get("away") || "");

    if (fixture && home && away) {
      const h = normalize(fixture.teams?.home?.name || "");
      const a = normalize(fixture.teams?.away?.name || "");

      if (!((h === home && a === away) || (h === away && a === home))) {
        return null;
      }
    }

    if (fixture) fixture.__tz = tz;
    return fixture;
  }

  const date = params.get("date");
  const home = normalize(params.get("home") || "");
  const away = normalize(params.get("away") || "");

  if (!date || !home || !away) return null;

  const { rows, tz } = await fixturesQuery(`/fixtures?date=${date}`, key);

  const found = rows.find(item => {
    const h = normalize(item.teams?.home?.name || "");
    const a = normalize(item.teams?.away?.name || "");

    return (h === home && a === away) ||
           (h === away && a === home);
  }) || null;

  if (found) found.__tz = tz;
  return found;
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

  const failed = results.filter(r => r.status === "rejected");
  const complete = failed.length === 0;
  const event = normalizeFixture(fixture, fixture.__tz);

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
    },
    complete,
    warning: complete
      ? ""
      : friendlyMessage(failed[0].reason || new ApiError("", "api"))
  };
}

/* ---------- RÉPONSES ---------- */

function errorResponse(error) {
  const kind = error.kind || "api";

  return Response.json(
    {
      error: "Impossible de charger les données football.",
      message: friendlyMessage(error),
      details: error.message,
      kind
    },
    { status: kind === "rate" ? 429 : 502 }
  );
}

async function handleDetail(params, key) {
  const id = params.get("eventId");
  const cacheName = id && /^\d+$/.test(id) ? `detail-v2-${id}` : "";
  const cached = cacheName ? await cacheRead(cacheName) : null;

  if (cached && detailIsFresh(cached)) {
    return Response.json({
      ...cached.data,
      cacheStatus: "cache",
      savedAt: cached.savedAt
    });
  }

  try {
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

    const details = await matchDetails(fixture, key);

    /* On ne mémorise que les réponses complètes */
    if (details.complete) {
      await cacheWrite(`detail-v2-${fixture.fixture.id}`, details);
    } else if (cached) {
      return Response.json({
        ...cached.data,
        cacheStatus: "stale",
        savedAt: cached.savedAt,
        warning: details.warning
      });
    }

    return Response.json({
      ...details,
      cacheStatus: "api",
      savedAt: Date.now()
    });
  } catch (error) {
    if (cached) {
      return Response.json({
        ...cached.data,
        cacheStatus: "stale",
        savedAt: cached.savedAt,
        warning: friendlyMessage(error)
      });
    }

    throw error;
  }
}

async function handleList(date, key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return Response.json(
      { message: "Date invalide. Format attendu : AAAA-MM-JJ." },
      { status: 400 }
    );
  }

  const cacheName = `list-v2-${date}`;
  const cached = await cacheRead(cacheName);

  if (cached && listIsFresh(cached, date)) {
    return Response.json({
      ...cached.data,
      cacheStatus: "cache",
      savedAt: cached.savedAt
    });
  }

  try {
    const { rows: fixtures, tz } = await fixturesQuery(
      `/fixtures?date=${date}`,
      key
    );

    const body = {
      sport: "football",
      date,
      count: fixtures.length,
      source: "API-Football",
      sources: {
        apiFootball: true,
        sportScore: false,
        theSportsDB: false
      },
      events: fixtures.map(item => normalizeFixture(item, tz))
    };

    await cacheWrite(cacheName, body);

    return Response.json({
      ...body,
      cacheStatus: "api",
      savedAt: Date.now()
    });
  } catch (apiError) {
    /* 1) Priorité : la dernière copie complète d'API-Football */
    if (cached) {
      return Response.json({
        ...cached.data,
        cacheStatus: "stale",
        savedAt: cached.savedAt,
        warning: friendlyMessage(apiError)
      });
    }

    /* 2) Dernier recours : sources de secours, marquées incomplètes */
    let oldEvents = [];

    try {
      oldEvents = await oldSources(date);
    } catch {
      oldEvents = [];
    }

    if (oldEvents.length) {
      return Response.json({
        sport: "football",
        date,
        count: oldEvents.length,
        source: "Sources de secours",
        partial: true,
        cacheStatus: "fallback",
        sources: {
          apiFootball: false,
          sportScore: true,
          theSportsDB: true
        },
        warning: friendlyMessage(apiError),
        events: oldEvents
      });
    }

    throw apiError;
  }
}

async function handleStandings(params, key) {
  const league = params.get("league") || "";
  const season = params.get("season") || "";

  if (!/^\d+$/.test(league) || !/^\d{4}$/.test(season)) {
    return Response.json(
      { message: "Paramètres de classement invalides." },
      { status: 400 }
    );
  }

  const cacheName = `standings-v2-${league}-${season}`;
  const cached = await cacheRead(cacheName);

  if (cached && (Date.now() - cached.savedAt) / 1000 < STANDINGS_TTL) {
    return Response.json({
      ...cached.data,
      cacheStatus: "cache",
      savedAt: cached.savedAt
    });
  }

  try {
    const rows = await apiFootball(
      `/standings?league=${league}&season=${season}`,
      key
    );

    const body = {
      source: "API-Football",
      league: rows[0]?.league?.name || "",
      groups: rows[0]?.league?.standings || []
    };

    await cacheWrite(cacheName, body);

    return Response.json({
      ...body,
      cacheStatus: "api",
      savedAt: Date.now()
    });
  } catch (error) {
    if (cached) {
      return Response.json({
        ...cached.data,
        cacheStatus: "stale",
        savedAt: cached.savedAt,
        warning: friendlyMessage(error)
      });
    }

    throw error;
  }
}

export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const date = params.get("date");
  const key = env.API_FOOTBALL_KEY;

  if (!key) {
    return Response.json(
      { error: "Clé API_FOOTBALL_KEY absente dans Cloudflare." },
      { status: 500 }
    );
  }

  try {
    if (params.has("standings")) {
      return await handleStandings(params, key);
    }

    if (params.has("eventId") || (
      params.has("home") && params.has("away") && date
    )) {
      return await handleDetail(params, key);
    }

    return await handleList(date, key);
  } catch (error) {
    return errorResponse(error);
  }
}



