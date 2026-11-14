
const $ = s => document.querySelector(s);

const state = {
  events: [],
  date: new Date().toLocaleDateString('en-CA', {
    timeZone: 'Africa/Brazzaville'
  })
};

const fmtDate = d =>
  new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Brazzaville'
  });

const safe = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

function image(url, alt, size = 42) {
  if (!url) return '';
  return `<img src="${safe(url)}" alt="${safe(alt)}"
    width="${size}" height="${size}"
    style="object-fit:contain;max-width:${size}px;max-height:${size}px"
    onerror="this.style.display='none'">`;
}

const countryFlags = {
  'congo': '🇨🇬',
  'congo brazzaville': '🇨🇬',
  'democratic republic of the congo': '🇨🇩',
  'rd congo': '🇨🇩',
  'cameroun': '🇨🇲',
  'cameroon': '🇨🇲',
  'gabon': '🇬🇦',
  'senegal': '🇸🇳',
  'cote d ivoire': '🇨🇮',
  'ivory coast': '🇨🇮',
  'nigeria': '🇳🇬',
  'ghana': '🇬🇭',
  'morocco': '🇲🇦',
  'maroc': '🇲🇦',
  'algeria': '🇩🇿',
  'algerie': '🇩🇿',
  'tunisia': '🇹🇳',
  'tunisie': '🇹🇳',
  'egypt': '🇪🇬',
  'egypte': '🇪🇬',
  'south africa': '🇿🇦',
  'afrique du sud': '🇿🇦',
  'england': '🏴',
  'france': '🇫🇷',
  'spain': '🇪🇸',
  'italy': '🇮🇹',
  'germany': '🇩🇪',
  'netherlands': '🇳🇱',
  'portugal': '🇵🇹',
  'brazil': '🇧🇷',
  'argentina': '🇦🇷',
  'united states': '🇺🇸',
  'usa': '🇺🇸',
  'japan': '🇯🇵',
  'south korea': '🇰🇷',
  'australia': '🇦🇺'
};

function flag(country) {
  const key = String(country || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim();

  return countryFlags[key] || '🌍';
}

function statusOf(e) {
  const status = String(e.strStatus || '').toLowerCase();

  if (/live|in progress|half time|playing/.test(status)) return 'live';
  if (/finished|complete|full time/.test(status)) return 'finished';
  if (/postponed|cancelled|abandoned|suspended/.test(status)) return 'postponed';

  if (
    e.intHomeScore !== null &&
    e.intHomeScore !== undefined &&
    e.intAwayScore !== null &&
    e.intAwayScore !== undefined
  ) return 'finished';

  return 'upcoming';
}

function statusLabel(e) {
  const status = statusOf(e);
  if (status === 'live') return '🔴 En direct';
  if (status === 'finished') return 'Terminé';
  if (status === 'postponed') return 'Reporté';
  return 'À venir';
}

function eventTime(e) {
  const t = String(e.strTime || '');
  return /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : 'Heure non communiquée';
}

function scoreOf(e) {
  const home = e.intHomeScore;
  const away = e.intAwayScore;

  if (home === null || home === undefined ||
      away === null || away === undefined) return 'VS';

  return `${safe(home)} – ${safe(away)}`;
}

function teamCard(name, logo) {
  return `
    <div class="team" style="display:flex;flex-direction:column;
      align-items:center;gap:7px;text-align:center">
      ${image(logo, name, 48)}
      <span>${safe(name || 'Équipe inconnue')}</span>
    </div>
  `;
}

function section(title, content) {
  return `
    <section style="margin-top:22px">
      <h3>${safe(title)}</h3>
      ${content || '<p class="muted">Informations non disponibles.</p>'}
    </section>
  `;
}

function getValue(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return '';
}

function eventDescription(item) {
  return getValue(item, [
    'strTimeline', 'strEvent', 'strType',
    'strDetail', 'strDescription', 'strPlayer'
  ]) || 'Événement';
}

function eventMinute(item) {
  const minute = getValue(item, [
    'strTime', 'intTime', 'strMinute', 'intMinute'
  ]);
  return minute ? `${minute}${String(minute).includes("'") ? '' : "'"}` : '';
}

function renderTimeline(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="muted">Aucune chronologie communiquée par la source.</p>';
  }

  return `
    <div style="border-left:2px solid var(--border,#888);padding-left:14px">
      ${items.map(item => {
        const description = eventDescription(item);
        const player = getValue(item, ['strPlayer', 'strPlayer1']);
        const team = getValue(item, ['strTeam', 'strTeamName']);
        const assist = getValue(item, ['strAssist', 'strPlayer2']);
        const type = String(description).toLowerCase();

        let symbol = '•';
        if (/goal|but|penalty/.test(type)) symbol = '⚽';
        else if (/yellow|jaune/.test(type)) symbol = '🟨';
        else if (/red|rouge/.test(type)) symbol = '🟥';
        else if (/substitution|substitution|replace/.test(type)) symbol = '🔄';

        return `
          <div style="padding:9px 0">
            <strong>${safe(eventMinute(item) || '—')}</strong>
            ${symbol} ${safe(description)}
            ${player ? `<div>${safe(player)}</div>` : ''}
            ${assist ? `<small>Joueur associé : ${safe(assist)}</small>` : ''}
            ${team ? `<div class="muted">${safe(team)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLineup(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="muted">Compositions non communiquées par la source.</p>';
  }

  const teams = {};

  items.forEach(item => {
    const team = getValue(item, ['strTeam', 'strTeamName']) || 'Équipe';
    if (!teams[team]) teams[team] = [];
    teams[team].push(item);
  });

  return Object.entries(teams).map(([team, players]) => `
    <div style="margin-bottom:14px">
      <strong>${safe(team)}</strong>
      ${players.map(player => {
        const name = getValue(player, ['strPlayer', 'strPlayerName']) || 'Joueur';
        const position = getValue(player, ['strPosition', 'strPositionName']);
        const number = getValue(player, ['intSquadNumber', 'strNumber']);
        return `
          <div style="padding:5px 0;border-bottom:1px solid var(--border,#ddd)">
            ${number ? `#${safe(number)} ` : ''}
            ${safe(name)}
            ${position ? `<small class="muted"> · ${safe(position)}</small>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

function renderStatistics(items) {
  if (Array.isArray(items) && items.length) {
    return `
      <div style="overflow-x:auto">
        ${items.map(item => {
          const name = getValue(item, ['strStat', 'strStatistic', 'strType', 'name']);
          const home = getValue(item, ['intHome', 'strHome', 'home', 'value']);
          const away = getValue(item, ['intAway', 'strAway', 'away']);

          return `
            <div style="display:flex;justify-content:space-between;
              gap:8px;padding:9px 0;border-bottom:1px solid var(--border,#ddd)">
              <strong>${safe(home || '—')}</strong>
              <span>${safe(name || 'Statistique')}</span>
              <strong>${safe(away || '—')}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return '<p class="muted">Statistiques détaillées non communiquées par la source.</p>';
}

async function load() {
  $('#matchDate').value = state.date;
  $('#notice').className = 'notice';
  $('#notice').textContent = 'Chargement des rencontres...';
  $('#matches').innerHTML = '';
  $('#detail').classList.add('hidden');

  try {
    const response = await fetch(
      `/api/football?date=${encodeURIComponent(state.date)}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Source temporairement indisponible');
    }

    state.events = Array.isArray(data.events) ? data.events : [];

    render();

    $('#notice').textContent = state.events.length
      ? `${state.events.length} rencontre(s) trouvée(s) · ${fmtDate(state.date)}`
      : `Aucun match retourné pour le ${fmtDate(state.date)}.`;

  } catch (error) {
    $('#notice').className = 'notice error';
    $('#notice').textContent =
      `Impossible de charger les matchs : ${error.message}. Réessaie.`;
  }
}

function render() {
  const query = $('#search').value.trim().toLowerCase();
  const filter = $('#status').value;

  const matches = state.events.filter(e => {
    const text = [
      e.strHomeTeam,
      e.strAwayTeam,
      e.strLeague,
      e.strCountry
    ].join(' ').toLowerCase();

    return (!query || text.includes(query)) &&
      (filter === 'all' || statusOf(e) === filter);
  });

  $('#matches').innerHTML = matches.map(e => {
    const country = e.strCountry || '';
    const competitionLogo = image(
      e.competition_logo || e.strLeagueBadge,
      e.strLeague,
      22
    );

    return `
      <article class="match" data-id="${safe(e.idEvent)}">
        <div style="display:flex;align-items:center;justify-content:center;
          gap:8px;margin-bottom:12px">
          ${competitionLogo}
          <span>${safe(e.strLeague || 'Compétition non précisée')}</span>
        </div>

        <div style="display:flex;align-items:center;
          justify-content:space-around;gap:8px">
          ${teamCard(e.strHomeTeam, e.strHomeTeamBadge)}
          <div class="score" style="font-weight:bold;min-width:55px;
            text-align:center">${scoreOf(e)}</div>
          ${teamCard(e.strAwayTeam, e.strAwayTeamBadge)}
        </div>

        <div class="meta">
          <span>${flag(country)} ${safe(country)}</span>
          <span>${eventTime(e)} · ${statusLabel(e)}</span>
        </div>
      </article>
    `;
  }).join('');

  if (!matches.length) {
    $('#matches').innerHTML =
      '<p class="muted">Aucune rencontre pour cette recherche.</p>';
  }

  document.querySelectorAll('.match').forEach(element => {
    element.addEventListener('click', () => {
      detail(element.dataset.id);
    });
  });
}

async function detail(id) {
  const e = state.events.find(x => String(x.idEvent) === String(id));
  if (!e) return;

  const country = e.strCountry || '';

  $('#detail').classList.remove('hidden');
  $('#detail').innerHTML = `
    <button class="back" id="closeDetail">← Retour aux matchs</button>
    <h3>Chargement des détails du match...</h3>
    <p class="muted">Recherche des événements et statistiques disponibles.</p>
  `;

  $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });

  $('#closeDetail').addEventListener('click', () => {
    $('#detail').classList.add('hidden');
  });

  let details = null;
  let detailError = false;

  if (e.strTheSportsDBId) {
    try {
      const response = await fetch(
        `/api/football?eventId=${encodeURIComponent(e.strTheSportsDBId)}`
      );

      if (!response.ok) throw new Error('Détails indisponibles');

      details = await response.json();
    } catch (error) {
      detailError = true;
    }
  }

  const event = details?.event || e;
  const timeline = details?.timeline || [];
  const lineup = details?.lineup || [];
  const statistics = details?.statistics || [];

  const scorers = [
    event.strHomeGoalDetails
      ? `<p><strong>${safe(event.strHomeTeam || e.strHomeTeam)} :</strong> ${safe(event.strHomeGoalDetails)}</p>`
      : '',
    event.strAwayGoalDetails
      ? `<p><strong>${safe(event.strAwayTeam || e.strAwayTeam)} :</strong> ${safe(event.strAwayGoalDetails)}</p>`
      : ''
  ].filter(Boolean).join('');

  const homeTeam = e.strHomeTeam || event.strHomeTeam;
  const awayTeam = e.strAwayTeam || event.strAwayTeam;

  $('#detail').innerHTML = `
    <button class="back" id="closeDetail">← Retour aux matchs</button>

    <p class="eyebrow">
      ${flag(country)} ${safe(country)} · ${safe(e.strLeague || 'Football')}
    </p>

    <div style="display:flex;justify-content:space-around;
      align-items:center;gap:8px;text-align:center;margin:20px 0">
      ${teamCard(homeTeam, e.strHomeTeamBadge || event.strHomeTeamBadge)}
      <div>
        <h2>${scoreOf(e)}</h2>
        <small>${statusLabel(e)}</small>
      </div>
      ${teamCard(awayTeam, e.strAwayTeamBadge || event.strAwayTeamBadge)}
    </div>

    <div class="facts">
      <div class="fact"><small>Date</small>${safe(e.dateEvent || state.date)}</div>
      <div class="fact"><small>Heure</small>${eventTime(e)}</div>
      <div class="fact"><small>Stade</small>${safe(event.strVenue || e.strVenue || 'Non communiqué')}</div>
      <div class="fact"><small>Statut</small>${statusLabel(e)}</div>
    </div>

    ${section('⚽ Buteurs', scorers)}

    ${section('📅 Chronologie des événements', renderTimeline(timeline))}

    ${section('🟨 Cartons et remplacements',
      timeline.length
        ? renderTimeline(timeline.filter(item =>
            /yellow|red|card|carton|substitution|replace|remplacement/i
              .test(eventDescription(item))
          ))
        : '<p class="muted">Aucune information disponible.</p>'
    )}

    ${section('👥 Compositions des équipes', renderLineup(lineup))}

    ${section('📊 Statistiques du match', renderStatistics(statistics))}

    ${section('🧠 Analyse PREDICT XI',
      `<p class="muted">
        Les événements et statistiques disponibles sont présentés ci-dessus.
        Une analyse tactique et des conclusions automatiques seront ajoutées
        dans une prochaine évolution. Aucune donnée manquante n'est inventée.
      </p>`
    )}

    <p class="muted">
      Source : TheSportsDB
      ${detailError ? ' · La récupération des détails a échoué.' : ''}
      ${!e.strTheSportsDBId ? ' · Aucun identifiant TheSportsDB associé à ce match.' : ''}
    </p>
  `;

  $('#closeDetail').addEventListener('click', () => {
    $('#detail').classList.add('hidden');
  });
}

$('#matchDate').addEventListener('change', event => {
  if (event.target.value) {
    state.date = event.target.value;
    load();
  }
});

$('#prevDay').addEventListener('click', () => shift(-1));
$('#nextDay').addEventListener('click', () => shift(1));

$('#today').addEventListener('click', () => {
  state.date = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Africa/Brazzaville'
  });
  load();
});

$('#search').addEventListener('input', render);
$('#status').addEventListener('change', render);

function shift(amount) {
  const date = new Date(`${state.date}T12:00:00`);
  date.setDate(date.getDate() + amount);

  state.date = date.toLocaleDateString('en-CA', {
    timeZone: 'Africa/Brazzaville'
  });

  load();
}

load();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}



