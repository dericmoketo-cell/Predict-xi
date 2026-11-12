
const BASE = 'https://www.thesportsdb.com/api/v1/json/123';

export default async (req) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return Response.json(
      { message: 'Date invalide. Format attendu : AAAA-MM-JJ.' },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(
      `${BASE}/eventsday.php?d=${encodeURIComponent(date)}&s=Soccer`,
      { headers: { accept: 'application/json' } }
    );

    if (!upstream.ok) {
      return Response.json(
        { message: `TheSportsDB a répondu HTTP ${upstream.status}.` },
        { status: 502 }
      );
    }

    const data = await upstream.json();
    const events = (data.events || [])
      .filter(e => e.strSport === 'Soccer')
      .map(e => ({
        ...e,
        intHomeScore: e.intHomeScore ?? null,
        intAwayScore: e.intAwayScore ?? null
      }));

    return Response.json(
      { source: 'TheSportsDB', date, events },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } }
    );
  } catch (error) {
    return Response.json(
      { message: 'La source TheSportsDB ne répond pas actuellement.' },
      { status: 502 }
    );
  }
};
