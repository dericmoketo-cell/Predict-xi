const $ = s => document.querySelector(s);

const TZ = 'Africa/Brazzaville';

const dayOf = ms =>
  new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });

const hhmm = ms =>
  new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  });

/* ---------- MÉMOIRE DU TÉLÉPHONE (matchs par date) ---------- */

const STORE_KEY = 'predict-xi-days-v2';
const MAX_SAVED_DAYS = 6;

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  const dates = Object.keys(store).sort(
    (a, b) => (store[a].savedAt || 0) - (store[b].savedAt || 0)
  );

  while (dates.length > MAX_SAVED_DAYS) {
    delete store[dates.shift()];
  }

  while (true) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
      return;
    } catch {
      if (!dates.length) return;
      delete store[dates.shift()];
    }
  }
}

const state = {
  events: [],
  days: readStore(),
  details: {},
  open: {},
  standings: {},
  view: null,
  tab: 'avant',
  date: dayOf(Date.now())
};

let loadToken = 0;

function saveDay(date, events, savedAt, failedAt = 0) {
  /* Le champ "raw" est volumineux et inutile : on ne le garde pas */
  const clean = events.map(({ raw, _partial, ...rest }) => rest);

  state.days[date] = { events: clean, savedAt, failedAt };

  const store = readStore();
  store[date] = { events: clean, savedAt };
  writeStore(store);
}

/* Une copie est "fraîche" : pas besoin de redemander à l'API */
function dayIsFresh(entry, date) {
  if (entry.failedAt && Date.now() - entry.failedAt < 120000) return true;
  if (entry.partial) return false;

  const age = (Date.now() - entry.savedAt) / 1000;
  const today = dayOf(Date.now());

  if (date < today) return dayOf(entry.savedAt) > date;
  if (date === today) return age < 600;
  return age < 10800;
}

function noticeFor(date, entry, warning) {
  const n = entry.events.length;

  let text = n
    ? `${n} rencontre(s) trouvée(s) · ${fmtDate(date)}`
    : `Aucun match retourné pour le ${fmtDate(date)}.`;

  if (entry.partial) {
    text += ' · ⚠️ Liste incomplète (source de secours)';
  } else if (entry.savedAt) {
    text += ` · mis à jour à ${hhmm(entry.savedAt)}`;
  }

  if (warning) text += ` · ⚠️ ${warning}`;

  return text;
}

function setNotice(text, isError = false) {
  $('#notice').className = isError ? 'notice error' : 'notice';
  $('#notice').textContent = text;
}

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
  const status = String(
    e.strStatusShort || e.strStatus || ''
  ).toLowerCase();

  if (/live|in progress|half time|playing|1h|2h|ht/.test(status)) {
    return 'live';
  }

  if (/finished|complete|full time|ft|aet|pen/.test(status)) {
    return 'finished';
  }

  if (/postponed|cancelled|abandoned|suspended|pst|canc|abd|susp|awd/.test(status)) {
    return 'postponed';
  }

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
  const k = kickoffMs(e);
  if (k === null) return 'Heure non communiquée';

  /* Déjà à l'heure de Brazzaville (demandée à l'API) */
  if (e.strTimezone === TZ) return String(e.strTime).slice(0, 5);

  return new Date(k).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ
  });
}

function eventDate(e) {
  const k = kickoffMs(e);
  if (k === null) return e.dateEvent || state.date;
  if (e.strTimezone === TZ) return e.dateEvent;
  return dayOf(k);
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
    if (obj?.[key] !== undefined &&
        obj[key] !== null &&
        obj[key] !== '') {
      return obj[key];
    }
  }
  return '';
}

function eventDescription(item) {
  return getValue(item, [
    'strDetail',
    'strEvent',
    'strType',
    'strTimeline',
    'strDescription',
    'strPlayer'
  ]) || 'Événement';
}

function eventMinute(item) {
  const minute = getValue(item, [
    'strTime',
    'intTime',
    'strMinute',
    'intMinute'
  ]);

  return minute
    ? `${minute}${String(minute).includes("'") ? '' : "'"}`
    : '';
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
        const type = String(
          `${item.strType || ''} ${description}`
        ).toLowerCase();

        let symbol = '•';

        if (/goal|but|penalty|own goal/.test(type)) symbol = '⚽';
        else if (/yellow/.test(type)) symbol = '🟨';
        else if (/red/.test(type)) symbol = '🟥';
        else if (/substitution/.test(type)) symbol = '🔄';
        else if (/var/.test(type)) symbol = '📺';

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

/* COMPOSITIONS API-FOOTBALL */

function renderLineup(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="muted">Compositions non communiquées par la source.</p>';
  }

  return items.map(team => {
    const name = team.team?.name || 'Équipe';
    const players = team.startXI || [];
    const substitutes = team.substitutes || [];

    const renderPlayers = (list, title) => `
      <div style="margin:12px 0">
        <strong>${safe(title)}</strong>
        ${list.length ? list.map(item => {
          const p = item.player || {};

          return `
            <div style="padding:6px 0;border-bottom:1px solid var(--border,#ddd)">
              ${p.number ? `#${safe(p.number)} ` : ''}
              ${safe(p.name || 'Joueur non communiqué')}
              ${p.pos ? `<small class="muted"> · ${safe(p.pos)}</small>` : ''}
            </div>
          `;
        }).join('') : '<p class="muted">Non communiqué.</p>'}
      </div>
    `;

    return `
      <div style="margin-bottom:20px">
        <h4>${safe(name)}</h4>
        ${team.formation
          ? `<p>Formation : ${safe(team.formation)}</p>`
          : ''}
        ${renderPlayers(players, 'Titulaires')}
        ${renderPlayers(substitutes, 'Remplaçants')}
      </div>
    `;
  }).join('');
}

/* STATISTIQUES API-FOOTBALL */

function renderStatistics(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="muted">Statistiques détaillées non communiquées par la source.</p>';
  }

  const home = items[0] || {};
  const away = items[1] || {};

  const homeStats = home.statistics || [];
  const awayStats = away.statistics || [];

  if (!homeStats.length && !awayStats.length) {
    return '<p class="muted">Statistiques détaillées non communiquées par la source.</p>';
  }

  const getStat = (list, type) => {
    const found = list.find(x => x.type === type);
    return found?.value ?? '—';
  };

  const types = [
    'Ball Possession',
    'Total Shots',
    'Shots on Goal',
    'Shots off Goal',
    'Blocked Shots',
    'Corner Kicks',
    'Fouls',
    'Offsides',
    'Yellow Cards',
    'Red Cards',
    'Goalkeeper Saves',
    'Total passes',
    'Passes accurate',
    'Passes %'
  ];

  return `
    <div style="overflow-x:auto">
      <div style="display:flex;justify-content:space-between;
        gap:8px;padding:8px 0;font-weight:bold">
        <span>${safe(home.team?.name || 'Domicile')}</span>
        <span>Statistique</span>
        <span>${safe(away.team?.name || 'Extérieur')}</span>
      </div>

      ${types.map(type => {
        const h = getStat(homeStats, type);
        const a = getStat(awayStats, type);

        if (h === '—' && a === '—') return '';

        return `
          <div style="display:flex;justify-content:space-between;
            gap:8px;padding:9px 0;border-bottom:1px solid var(--border,#ddd)">
            <strong>${safe(h)}</strong>
            <span style="text-align:center">${safe(type)}</span>
            <strong>${safe(a)}</strong>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* BUTEURS À PARTIR DE LA CHRONOLOGIE */

function renderScorers(items, homeName, awayName) {
  if (!Array.isArray(items)) items = [];

  const goals = items.filter(item => {
    const type = String(
      `${item.strType || ''} ${item.strDetail || ''} ${item.strEvent || ''}`
    ).toLowerCase();

    return /goal|penalty/.test(type);
  });

  if (!goals.length) {
    return '<p class="muted">Informations sur les buteurs non disponibles.</p>';
  }

  return goals.map(item => {
    const player = item.strPlayer || 'Buteur non communiqué';
    const team = item.strTeam || '';
    const assist = item.strAssist || '';

    return `
      <p>
        ⚽ <strong>${safe(player)}</strong>
        ${safe(eventMinute(item))}
        ${team ? `<br><small>${safe(team)}</small>` : ''}
        ${assist ? `<br><small>Passe décisive : ${safe(assist)}</small>` : ''}
      </p>
    `;
  }).join('');
}

/* CHARGEMENT DES MATCHS (avec mémoire par date) */

async function load() {
  const date = state.date;
  const token = ++loadToken;

  $('#matchDate').value = date;
  hideDetailPanel();

  const cached = state.days[date];

  if (cached) {
    /* On affiche tout de suite ce qu'on a déjà : rien ne disparaît */
    state.events = cached.events;
    render();

    if (dayIsFresh(cached, date)) {
      setNotice(noticeFor(date, cached, ''));
      return;
    }

    setNotice(`${noticeFor(date, cached, '')} · actualisation…`);
  } else {
    state.events = [];
    $('#matches').innerHTML = '';
    setNotice('Chargement des rencontres...');
  }

  try {
    const response = await fetch(
      `/api/football?date=${encodeURIComponent(date)}`
    );

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.message || data.error || 'Source temporairement indisponible'
      );
    }

    const incoming = Array.isArray(data.events) ? data.events : [];
    const previous = state.days[date];
    const hasGoodPrevious =
      previous && !previous.partial && previous.events.length > 0;

    let warning = data.warning || '';

    if (data.partial === true) {
      if (hasGoodPrevious) {
        /* Liste incomplète : on garde la bonne liste déjà chargée */
        state.days[date] = { ...previous, failedAt: Date.now() };
        warning = warning ||
          'Liste incomplète reçue : les matchs déjà chargés sont conservés.';
      } else {
        state.days[date] = {
          events: incoming.map(e => ({ ...e, _partial: true })),
          savedAt: data.savedAt || Date.now(),
          partial: true,
          failedAt: Date.now()
        };
      }
    } else if (!incoming.length && hasGoodPrevious) {
      state.days[date] = { ...previous, failedAt: Date.now() };
      warning =
        'La source a renvoyé 0 match : les matchs déjà chargés sont conservés.';
    } else {
      saveDay(
        date,
        incoming,
        data.savedAt || Date.now(),
        data.warning ? Date.now() : 0
      );
    }

    if (token !== loadToken) return;

    state.events = state.days[date].events;
    render();
    setNotice(noticeFor(date, state.days[date], warning));

  } catch (error) {
    if (token !== loadToken) return;

    const current = state.days[date];

    if (current) {
      /* On garde l'affichage et on évite de redemander trop vite */
      state.days[date] = { ...current, failedAt: Date.now() };
      setNotice(
        `${noticeFor(date, current, '')} · ⚠️ ${error.message}`
      );
    } else {
      setNotice(
        `Impossible de charger les matchs : ${error.message}. Réessaie plus tard.`,
        true
      );
    }
  }
}

/* AFFICHAGE DES MATCHS — REGROUPÉS PAR COMPÉTITION */

const norm = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/* Compétitions affichées en premier (dans cet ordre).
   Les noms doivent correspondre à ceux d'API-Football. */
const PRIORITY = [
  { name: 'uefachampionsleague', mode: 'has' },
  { name: 'uefaeuropaleague', mode: 'has' },
  { name: 'uefaeuropaconferenceleague', mode: 'has' },
  { name: 'worldcup', mode: 'start' },
  { name: 'africacupofnations', mode: 'has' },
  { name: 'cafchampionsleague', mode: 'has' },
  { name: 'cafconfederationcup', mode: 'has' },
  { name: 'uefanationsleague', mode: 'has' },
  { name: 'eurochampionship', mode: 'start' },
  { name: 'premierleague', mode: 'exact', country: 'england' },
  { name: 'laliga', mode: 'exact', country: 'spain' },
  { name: 'seriea', mode: 'exact', country: 'italy' },
  { name: 'bundesliga', mode: 'exact', country: 'germany' },
  { name: 'ligue1', mode: 'exact', country: 'france' },
  { name: 'primeiraliga', mode: 'exact', country: 'portugal' },
  { name: 'eredivisie', mode: 'exact', country: 'netherlands' },
  { name: 'copalibertadores', mode: 'has' },
  { name: 'seriea', mode: 'exact', country: 'brazil' },
  { name: 'majorleaguesoccer', mode: 'exact', country: 'usa' }
];

function priorityOf(e) {
  const n = norm(e.strLeague);
  const c = norm(e.strCountry);

  /* Jeunes (U17, U19, U20, U21...) et féminines : pas mis en avant */
  if (/u1\d|u2\d|women|feminin|femenin/.test(n)) return 999;

  for (let i = 0; i < PRIORITY.length; i++) {
    const r = PRIORITY[i];

    if (r.country && r.country !== c) continue;

    const ok =
      r.mode === 'exact' ? n === r.name :
      r.mode === 'start' ? n.startsWith(r.name) :
      n.includes(r.name);

    if (ok) return i;
  }

  return 999;
}

function sortKey(e) {
  const k = kickoffMs(e);
  return k === null ? 9e15 : k;
}

function matchRow(e) {
  return `
    <article class="match match-row"
      data-id="${safe(e.idEvent || '')}">

      <div class="match-teams">
        <div class="match-team">
          ${image(e.strHomeTeamBadge, e.strHomeTeam, 25)}
          <span>${safe(e.strHomeTeam || 'Équipe inconnue')}</span>
        </div>

        <div class="match-team">
          ${image(e.strAwayTeamBadge, e.strAwayTeam, 25)}
          <span>${safe(e.strAwayTeam || 'Équipe inconnue')}</span>
        </div>

        <small class="match-time">
          ${safe(eventDate(e))}
          · ${safe(eventTime(e))}
        </small>
      </div>

      <div class="match-probs">
        <span>—</span>
        <span>—</span>
        <span>—</span>
      </div>

      <div class="match-pick">—</div>

      <div class="match-odds">—</div>

      <div class="match-result">
        <strong>${scoreOf(e)}</strong>
        <small>${statusLabel(e)}</small>
      </div>

    </article>
  `;
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

  const header = `
    <div class="matches-head">
      <div>RENCONTRE</div>
      <div>1 · N · 2</div>
      <div>PRONO.</div>
      <div>COEF.</div>
      <div>SCORE</div>
    </div>
  `;

  if (!matches.length) {
    $('#matches').innerHTML = header +
      '<p class="muted">Aucune rencontre pour cette recherche.</p>';
    return;
  }

  const groups = new Map();

  matches.forEach(e => {
    const key = `${e.strCountry || ''}|${e.strLeague || ''}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        league: e.strLeague || 'Compétition non précisée',
        country: e.strCountry || '',
        rank: priorityOf(e),
        items: []
      });
    }

    groups.get(key).items.push(e);
  });

  const list = [...groups.values()].sort((a, b) =>
    a.rank - b.rank ||
    a.country.localeCompare(b.country) ||
    a.league.localeCompare(b.league)
  );

  const html = list.map(g => {
    g.items.sort((a, b) => {
      const x = sortKey(a);
      const y = sortKey(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });

    const liveCount = g.items.filter(e => statusOf(e) === 'live').length;

    const isOpen = query
      ? true
      : (g.key in state.open
          ? state.open[g.key]
          : (g.rank < 999 || liveCount > 0));

    const headStyle =
      'width:100%;min-width:350px;display:flex;align-items:center;' +
      'justify-content:space-between;gap:8px;text-align:left;' +
      'background:#0f1a2b;color:#fff;border:0;' +
      'border-bottom:1px solid #29364b;border-left:3px solid #22d795;' +
      'border-radius:0;padding:11px 10px;font-size:12px;font-weight:700';

    return `
      <button class="group-head" type="button"
        data-group="${safe(g.key)}" style="${headStyle}">
        <span>
          ${flag(g.country)} ${safe(g.league)}
          ${g.country
            ? `<small class="muted"> · ${safe(g.country)}</small>`
            : ''}
        </span>
        <span style="white-space:nowrap;font-weight:600">
          ${liveCount ? `🔴 ${liveCount} · ` : ''}${g.items.length}
          ${isOpen ? '▾' : '▸'}
        </span>
      </button>
      ${isOpen ? g.items.map(matchRow).join('') : ''}
    `;
  }).join('');

  $('#matches').innerHTML = header + html;
}

/* DÉTAILS DU MATCH — panneau plein écran */

function showDetailPanel() {
  const d = $('#detail');

  d.classList.remove('hidden');

  Object.assign(d.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    zIndex: '50',
    overflowY: 'auto',
    margin: '0',
    border: '0',
    borderRadius: '0',
    background: '#080e19',
    padding:
      'calc(10px + env(safe-area-inset-top, 0px)) 14px ' +
      'calc(40px + env(safe-area-inset-bottom, 0px))'
  });

  d.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function hideDetailPanel() {
  $('#detail').classList.add('hidden');
  document.body.style.overflow = '';
}

/* DÉTAILS DU MATCH */

let detailToken = 0;

const BACK_BUTTON =
  '<button class="back" id="closeDetail" style="position:sticky;top:0;' +
  'z-index:3;display:block;width:100%;text-align:left;background:#080e19;' +
  'padding:12px 0;font-size:15px">← Retour aux matchs</button>';

/* Heure de début réelle du match (en millisecondes) */
function kickoffMs(e) {
  if (e.isoDate) {
    const ms = Date.parse(e.isoDate);
    if (!Number.isNaN(ms)) return ms;
  }

  const t = String(e.strTime || '');
  if (!e.dateEvent || !/^\d{2}:\d{2}/.test(t)) return null;

  /* Sources de secours : heure universelle */
  const ms = Date.parse(`${e.dateEvent}T${t.slice(0, 5)}:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

const TOO_EARLY_MS = 2 * 60 * 60 * 1000;

/* Message adapté quand une rubrique est vide */
function emptyNote(phase, kind, failed) {
  let text;

  if (failed) {
    text = 'Données non chargées (voir le message en bas de page).';
  } else if (phase === 'upcoming') {
    text = kind === 'lineup'
      ? "Pas encore publiées. Selon la documentation d'API-Football, les compositions arrivent environ 20 à 40 minutes avant le coup d'envoi, si la compétition est couverte."
      : 'Disponible une fois le match commencé.';
  } else if (phase === 'postponed') {
    text = 'Match reporté ou interrompu : aucune donnée.';
  } else if (phase === 'live') {
    text = "Rien de communiqué pour l'instant. Fermez puis rouvrez ce match dans quelques minutes pour actualiser.";
  } else {
    text = 'Non communiqué par la source pour cette compétition.';
  }

  return `<p class="muted">${safe(text)}</p>`;
}

function startText(e, phase) {
  const k = kickoffMs(e);
  if (phase !== 'upcoming' || k === null) return '';

  const diff = k - Date.now();
  if (diff <= 0) return "Coup d'envoi imminent";

  const total = Math.round(diff / 60000);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;

  return "Coup d'envoi dans " + [
    days ? `${days} j` : '',
    hours ? `${hours} h` : '',
    `${mins} min`
  ].filter(Boolean).join(' ');
}

const pairText = p =>
  p && p.home != null && p.away != null ? `${p.home} – ${p.away}` : '';

function factItem(label, value) {
  return value
    ? `<div class="fact"><small>${safe(label)}</small>${safe(value)}</div>`
    : '';
}

/* Informations du match : affichées seulement si la source les fournit */
function factsHtml(shown, e) {
  const round = String(shown.strRound || e.strRound || '')
    .replace(/^Regular Season - /, 'Journée ');

  const live = ['1H', '2H', 'ET'].includes(shown.strStatusShort) &&
    shown.intElapsed != null;

  return [
    factItem('Date', eventDate(e)),
    factItem('Heure (Brazzaville)', eventTime(e)),
    factItem('Stade', shown.strVenue || e.strVenue || 'Non communiqué'),
    factItem('Ville', shown.strCity || e.strCity),
    factItem('Arbitre', shown.strReferee || e.strReferee),
    factItem('Journée / tour', round),
    factItem('Statut', statusLabel(shown)),
    factItem('Minute', live ? `${shown.intElapsed}'` : ''),
    factItem('Mi-temps', pairText(shown.halftime)),
    factItem('Prolongation', pairText(shown.extratime)),
    factItem('Tirs au but', pairText(shown.penalty))
  ].join('');
}

function headerHtml(e, shown, phase) {
  const k = kickoffMs(e);

  const dateText = k !== null
    ? new Date(k).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        timeZone: TZ
      })
    : '';

  let center;

  if (phase === 'upcoming' || phase === 'postponed') {
    center = `
      <div style="font-size:30px;font-weight:900">${safe(eventTime(e))}</div>
      <small>${safe(dateText)}</small><br>
      <small class="muted">${safe(startText(e, phase) || statusLabel(shown))}</small>
    `;
  } else {
    center = `
      <h2>${scoreOf(shown)}</h2>
      <small>${statusLabel(shown)}</small>
    `;
  }

  return `
    <div style="display:flex;justify-content:space-around;
      align-items:center;gap:8px;text-align:center;margin:18px 0">

      ${teamCard(e.strHomeTeam || shown.strHomeTeam,
        e.strHomeTeamBadge || shown.strHomeTeamBadge)}

      <div>${center}</div>

      ${teamCard(e.strAwayTeam || shown.strAwayTeam,
        e.strAwayTeamBadge || shown.strAwayTeamBadge)}
    </div>
  `;
}

/* ---------- Compositions sur le terrain ---------- */

const playerPhoto = id =>
  `https://media.api-sports.io/football/players/${encodeURIComponent(id)}.png`;

function pitchPlayer(p, x, y) {
  const shortName = String(p.name || '').trim().split(' ').pop();

  return `
    <div class="pitch-player" style="left:${x}%;top:${y}%">
      ${p.id
        ? `<img src="${safe(playerPhoto(p.id))}" alt="" loading="lazy"
             onerror="this.style.visibility='hidden'">`
        : '<span style="display:block;width:34px;height:34px;margin:0 auto 3px"></span>'}
      <span class="player-number">${safe(p.number ?? '')}</span>
      ${safe(shortName)}
    </div>
  `;
}

function pitchHtml(team) {
  const start = team.startXI || [];
  if (!start.length) return '';

  const rows = {};

  for (const item of start) {
    const p = item.player || {};
    const m = String(p.grid || '').match(/^(\d+):(\d+)$/);
    if (!m) return '';
    (rows[m[1]] ||= []).push({ p, col: Number(m[2]) });
  }

  const keys = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const count = keys.length;

  const dots = keys.map((row, i) => {
    const list = rows[row].sort((a, b) => a.col - b.col);
    const y = count === 1 ? 50 : 88 - i * (78 / (count - 1));

    return list.map((item, j) =>
      pitchPlayer(item.p, ((j + 1) / (list.length + 1)) * 100, y)
    ).join('');
  }).join('');

  return `<div class="pitch">${dots}</div>`;
}

function lineupTab(lineup, phase, failed) {
  if (!lineup.length) return emptyNote(phase, 'lineup', failed);

  return lineup.map(team => {
    const pitch = pitchHtml(team);

    if (!pitch) return renderLineup([team]);

    const subs = team.substitutes || [];

    return `
      <div style="margin-bottom:26px">
        <h4 style="display:flex;justify-content:space-between;gap:8px">
          <span>${safe(team.team?.name || 'Équipe')}</span>
          <span class="muted">${safe(team.formation || '')}</span>
        </h4>
        ${team.coach?.name
          ? `<p class="muted">Entraîneur : ${safe(team.coach.name)}</p>`
          : ''}
        ${pitch}
        ${subs.length ? `
          <strong>Remplaçants</strong>
          <div class="substitutes" style="margin-top:8px">
            ${subs.map(item => {
              const p = item.player || {};

              return `
                <div class="substitute">
                  ${p.id
                    ? `<img src="${safe(playerPhoto(p.id))}" alt="" loading="lazy"
                         onerror="this.style.visibility='hidden'">`
                    : ''}
                  <span>
                    ${p.number ? `#${safe(p.number)} ` : ''}${safe(p.name || '')}
                  </span>
                </div>
              `;
            }).join('')}
          </div>` : ''}
      </div>
    `;
  }).join('');
}

/* ---------- Événements ---------- */

function eventsTab(shown, timeline, phase, failed) {
  const goalless = phase === 'finished' &&
    shown.intHomeScore != null && shown.intAwayScore != null &&
    Number(shown.intHomeScore) + Number(shown.intAwayScore) === 0;

  let scorers;

  if (goalless) {
    scorers = '<p class="muted">Aucun but dans ce match.</p>';
  } else if (!timeline.length) {
    scorers = emptyNote(phase, 'events', failed);
  } else {
    scorers = renderScorers(timeline, shown.strHomeTeam, shown.strAwayTeam);
  }

  const cards = timeline.filter(item =>
    /yellow|red|card|carton|substitution|replace|remplacement/i
      .test(`${item.strType || ''} ${eventDescription(item)}`)
  );

  let cardsHtml;

  if (cards.length) {
    cardsHtml = renderTimeline(cards);
  } else if (!timeline.length) {
    cardsHtml = emptyNote(phase, 'events', failed);
  } else {
    cardsHtml =
      '<p class="muted">Aucun carton ni remplacement dans les événements communiqués.</p>';
  }

  return `
    ${section('⚽ Buteurs', scorers)}
    ${section('📅 Chronologie des événements',
      timeline.length ? renderTimeline(timeline) : emptyNote(phase, 'events', failed))}
    ${section('🟨 Cartons et remplacements', cardsHtml)}
  `;
}

/* ---------- Classement ---------- */

function formDots(form) {
  const colors = { W: '#22d795', D: '#ffc857', L: '#ff6574' };

  return String(form || '').split('').map(c => `
    <span style="display:inline-block;width:8px;height:8px;border-radius:2px;
      margin-right:2px;background:${colors[c] || '#53647c'}"></span>
  `).join('');
}

function renderStandings(data, e) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];

  if (!groups.length || !groups[0]?.length) {
    return '<p class="muted">Classement non communiqué pour cette compétition.</p>';
  }

  return groups.map(rows => `
    ${rows[0]?.group ? `<h4>${safe(rows[0].group)}</h4>` : ''}
    <div class="standings">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th style="text-align:left">Équipe</th>
            <th>Pts</th><th>MJ</th><th>V</th><th>N</th><th>D</th>
            <th>BM</th><th>BE</th><th>Diff</th><th>Forme</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const mine =
              r.team?.id === e.intHomeId || r.team?.id === e.intAwayId;

            return `
              <tr class="${mine ? 'highlight' : ''}">
                <td>${safe(r.rank)}</td>
                <td style="text-align:left;white-space:nowrap">${safe(r.team?.name)}</td>
                <td><strong>${safe(r.points)}</strong></td>
                <td>${safe(r.all?.played)}</td>
                <td>${safe(r.all?.win)}</td>
                <td>${safe(r.all?.draw)}</td>
                <td>${safe(r.all?.lose)}</td>
                <td>${safe(r.all?.goals?.for)}</td>
                <td>${safe(r.all?.goals?.against)}</td>
                <td>${safe(r.goalsDiff)}</td>
                <td style="white-space:nowrap">${formDots(r.form)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}

async function loadStandings(e, key) {
  state.standings[key] = { loading: true };

  try {
    const response = await fetch(
      `/api/football?standings=1&league=${encodeURIComponent(e.intLeagueId)}` +
      `&season=${encodeURIComponent(e.intSeason)}`
    );

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.message || 'Classement indisponible');
    }

    state.standings[key] = { data };

  } catch (error) {
    state.standings[key] = {
      error: error instanceof TypeError
        ? 'Connexion impossible.'
        : (error.message || 'Classement indisponible'),
      at: Date.now()
    };
  }

  /* Si ce match est toujours affiché sur l'onglet Classement, on actualise */
  if (state.view?.e === e && state.tab === 'classement') {
    renderDetail();
  }
}

function standingsTab(e) {
  if (!e.intLeagueId || !e.intSeason) {
    return '<p class="muted">Classement indisponible : compétition ou saison non communiquée.</p>';
  }

  const key = `${e.intLeagueId}-${e.intSeason}`;
  let entry = state.standings[key];

  /* Une erreur est retentée après une minute */
  if (entry?.error && Date.now() - entry.at > 60000) {
    delete state.standings[key];
    entry = undefined;
  }

  if (!entry) {
    loadStandings(e, key);
    return '<p class="muted">Chargement du classement…</p>';
  }

  if (entry.loading) return '<p class="muted">Chargement du classement…</p>';

  if (entry.error) {
    return `<p class="muted">Classement indisponible : ${safe(entry.error)}</p>`;
  }

  return renderStandings(entry.data, e);
}

/* ---------- Affichage de la fiche ---------- */

const TABS = [
  ['avant', 'Avant-match'],
  ['compos', 'Compos'],
  ['classement', 'Classement'],
  ['events', 'Événements'],
  ['stats', 'Stats']
];

function renderDetail() {
  const v = state.view;
  if (!v) return;

  const { e, details, detailError, detailMessage } = v;
  const shown = details?.event || e;
  const timeline = details?.timeline || [];
  const lineup = details?.lineup || [];
  const statistics = details?.statistics || [];
  const phase = statusOf(shown);
  const country = e.strCountry || '';

  let body;

  if (state.tab === 'compos') {
    body = lineupTab(lineup, phase, detailError);
  } else if (state.tab === 'classement') {
    body = standingsTab(e);
  } else if (state.tab === 'events') {
    body = eventsTab(shown, timeline, phase, detailError);
  } else if (state.tab === 'stats') {
    body = statistics.length
      ? renderStatistics(statistics)
      : emptyNote(phase, 'stats', detailError);
  } else {
    body = `
      <div class="facts">${factsHtml(shown, e)}</div>
      <p class="muted" style="margin-top:16px">
        Les probabilités, pronostics et cotes ne sont pas encore proposés
        dans PREDICT XI : rien n'est inventé.
      </p>
    `;
  }

  const sourceLabel = e._partial
    ? 'Sources de secours (incomplètes)'
    : (details?.source || e.source || 'API-Football');

  const tabsBar = TABS.map(([key, label]) => `
    <button type="button" data-tab="${key}"
      class="${state.tab === key ? 'active' : ''}">${label}</button>
  `).join('');

  const keepScroll = $('#detail').scrollTop;

  $('#detail').innerHTML = `
    ${BACK_BUTTON}

    <p class="eyebrow">
      ${flag(country)} ${safe(country)} · ${safe(e.strLeague || 'Football')}
    </p>

    ${headerHtml(e, shown, phase)}

    <div class="match-tabs"
      style="position:sticky;top:46px;z-index:2;background:#080e19">
      ${tabsBar}
    </div>

    ${body}

    <p class="muted" style="margin-top:22px">
      Source : ${safe(sourceLabel)}
      ${detailError ? ` · ${safe(detailMessage || 'La récupération des détails a échoué.')}` : ''}
      ${!detailError && detailMessage ? ` · ${safe(detailMessage)}` : ''}
      ${details?.warning ? ` · ⚠️ ${safe(details.warning)}` : ''}
    </p>
  `;

  $('#detail').scrollTop = keepScroll;
}

async function detail(id) {
  const e = state.events.find(x => String(x.idEvent) === String(id));
  if (!e) return;

  const token = ++detailToken;

  showDetailPanel();

  $('#detail').innerHTML = `
    ${BACK_BUTTON}
    <h3>Chargement des détails du match...</h3>
    <p class="muted">Recherche des événements et statistiques disponibles.</p>
  `;

  let details = null;
  let detailError = false;
  let detailMessage = '';

  const phase0 = statusOf(e);
  const kickoff = kickoffMs(e);

  const tooEarly =
    phase0 === 'upcoming' &&
    kickoff !== null &&
    kickoff - Date.now() > TOO_EARLY_MS;

  const mem = state.details[id];
  const memOk = mem && (mem.final || Date.now() - mem.at < 180000);

  if (e._partial) {
    /* Match venu d'une source de secours : on n'utilise pas le quota API */
    detailMessage =
      'Détails indisponibles pour les matchs des sources de secours.';
  } else if (phase0 === 'postponed') {
    detailMessage = 'Match reporté : aucune donnée supplémentaire.';
  } else if (tooEarly) {
    detailMessage =
      "Aucune requête envoyée : le match est encore loin, rien n'est disponible. Cela économise votre quota.";
  } else if (memOk) {
    details = mem.data;
  } else {
    try {
      const params = new URLSearchParams({
        home: e.strHomeTeam || '',
        away: e.strAwayTeam || '',
        date: e.dateEvent || state.date
      });

      /* ID du match API-FOOTBALL */
      if (e.idEvent) {
        params.set('eventId', e.idEvent);
      }

      const response = await fetch(`/api/football?${params.toString()}`);

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.message || 'Détails indisponibles');
      }

      details = data;

      if (details.error) {
        throw new Error(details.error);
      }

      /* On garde en mémoire seulement une réponse complète */
      if (details.complete !== false) {
        state.details[id] = {
          data: details,
          at: Date.now(),
          final: statusOf(details.event || e) === 'finished'
        };
      }

    } catch (error) {
      detailError = true;
      detailMessage = error instanceof TypeError
        ? 'Connexion impossible.'
        : (error.message || '');
    }
  }

  /* Un autre match a été ouvert entre-temps : on ne touche à rien */
  if (token !== detailToken) return;

  state.view = { e, details, detailError, detailMessage };

  const phase = statusOf(details?.event || e);

  state.tab =
    phase === 'upcoming' || phase === 'postponed' ? 'avant' : 'events';

  renderDetail();
}

/* NAVIGATION ENTRE LES DATES */

$('#matchDate').addEventListener('change', event => {
  if (event.target.value) {
    state.date = event.target.value;
    load();
  }
});

$('#prevDay').addEventListener('click', () => shift(-1));
$('#nextDay').addEventListener('click', () => shift(1));

$('#today').addEventListener('click', () => {
  state.date = dayOf(Date.now());

  load();
});

/* Un seul écouteur pour les groupes et les matchs */
$('#matches').addEventListener('click', event => {
  const head = event.target.closest('.group-head');

  if (head) {
    const key = head.dataset.group;
    const query = $('#search').value.trim();

    if (!query) {
      const current = key in state.open
        ? state.open[key]
        : null;

      /* Si l'état n'a jamais été choisi, on le déduit de l'affichage */
      const wasOpen = current === null
        ? head.textContent.includes('▾')
        : current;

      state.open[key] = !wasOpen;
      render();
    }

    return;
  }

  const row = event.target.closest('.match');
  if (row) detail(row.dataset.id);
});

/* Un seul écouteur pour la fiche : retour et onglets */
$('#detail').addEventListener('click', event => {
  if (event.target.closest('#closeDetail')) {
    hideDetailPanel();
    return;
  }

  const tab = event.target.closest('[data-tab]');

  if (tab) {
    state.tab = tab.dataset.tab;
    renderDetail();
    $('#detail').scrollTop = 0;
  }
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




