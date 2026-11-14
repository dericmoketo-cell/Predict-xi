
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

  if (/live|in progress|half time|playing/.test(status)) {
    return 'live';
  }

  if (/finished|complete|full time/.test(status)) {
    return 'finished';
  }

  if (/postponed|cancelled|abandoned|suspended/.test(status)) {
    return 'postponed';
  }

  if (
    e.intHomeScore !== null &&
    e.intHomeScore !== undefined &&
    e.intAwayScore !== null &&
    e.intAwayScore !== undefined
  ) {
    return 'finished';
  }

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

  if (/^\d{2}:\d{2}/.test(t)) {
    return t.slice(0, 5);
  }

  return 'Heure non communiquée';
}

function scoreOf(e) {
  const home = e.intHomeScore;
  const away = e.intAwayScore;

  if (home === null || home === undefined ||
      away === null || away === undefined) {
    return 'VS';
  }

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
            text-align:center">
            ${scoreOf(e)}
          </div>

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

function detail(id) {
  const e = state.events.find(x => String(x.idEvent) === String(id));
  if (!e) return;

  const country = e.strCountry || '';
  const status = statusLabel(e);

  const scorers = [
    e.strHomeGoalDetails
      ? `<p><strong>${safe(e.strHomeTeam)} :</strong> ${safe(e.strHomeGoalDetails)}</p>`
      : '',
    e.strAwayGoalDetails
      ? `<p><strong>${safe(e.strAwayTeam)} :</strong> ${safe(e.strAwayGoalDetails)}</p>`
      : ''
  ].filter(Boolean).join('');

  const statistics = e.statistics || e.strStatistics;

  let statisticsHTML = '';

  if (Array.isArray(statistics) && statistics.length) {
    statisticsHTML = statistics.map(stat => `
      <p>${safe(stat.type || stat.name || 'Statistique')} :
      ${safe(stat.home ?? stat.value ?? '—')} -
      ${safe(stat.away ?? '—')}</p>
    `).join('');
  } else if (statistics && typeof statistics === 'object') {
    statisticsHTML = Object.entries(statistics).map(([key, value]) =>
      `<p><strong>${safe(key)} :</strong> ${safe(value)}</p>`
    ).join('');
  }

  $('#detail').innerHTML = `
    <button class="back" id="closeDetail">← Retour aux matchs</button>

    <p class="eyebrow">
      ${flag(country)} ${safe(country)} · ${safe(e.strLeague || 'Football')}
    </p>

    <div style="display:flex;justify-content:space-around;
      align-items:center;gap:8px;text-align:center;margin:20px 0">
      ${teamCard(e.strHomeTeam, e.strHomeTeamBadge)}

      <div>
        <h2>${scoreOf(e)}</h2>
        <small>${status}</small>
      </div>

      ${teamCard(e.strAwayTeam, e.strAwayTeamBadge)}
    </div>

    <div class="facts">
      <div class="fact">
        <small>Date</small>
        ${safe(e.dateEvent || state.date)}
      </div>

      <div class="fact">
        <small>Heure</small>
        ${eventTime(e)}
      </div>

      <div class="fact">
        <small>Stade</small>
        ${safe(e.strVenue || 'Non communiqué')}
      </div>

      <div class="fact">
        <small>Statut</small>
        ${status}
      </div>
    </div>

    <h3>Buteurs</h3>
    ${scorers || '<p class="muted">Aucune information sur les buteurs disponible pour cette rencontre.</p>'}

    <h3>Statistiques du match</h3>
    ${statisticsHTML || '<p class="muted">Les statistiques détaillées ne sont pas fournies par les sources pour cette rencontre.</p>'}

    <h3>Analyse PREDICT XI</h3>
    <p class="muted">
      Les probabilités de victoire, le score exact prévisionnel et les
      buteurs probables seront calculés dans le moteur de prédiction.
      Aucune donnée manquante n'est inventée.
    </p>

    <p class="muted">
      Source des données : ${safe(e.strSource || 'Source non précisée')}
    </p>
  `;

  $('#detail').classList.remove('hidden');
  $('#detail').scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });

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

