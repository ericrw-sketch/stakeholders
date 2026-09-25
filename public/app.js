const PRIO_COLORS = { A: '#d9480f', B: '#f59f00', C: '#5c7cfa' };

const state = { user: null, leads: [], markers: new Map(), selectedId: null, mine: [] };

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur'), { status: res.status });
  return data;
}

function shortName(lead) {
  return lead.name.split(' — ')[0].replace(/\s*\(.*\)$/, '');
}

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString('fr-BE') : esc(n);
}

// --- Carte -------------------------------------------------------------------

const map = L.map('map', { zoomControl: true }).setView([50.85, 4.36], 12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  maxZoom: 19,
}).addTo(map);

function markerIcon(lead, selected) {
  const size = selected ? 34 : 26;
  return L.divIcon({
    className: '',
    html: `<div class="pin prio-${esc(lead.priority)}${selected ? ' selected' : ''}" style="width:${size}px;height:${size}px">${lead.wave === 1 ? '1' : '2'}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Quand deux immeubles sont très proches, l'étiquette du plus à l'ouest passe à gauche.
function labelSide(lead) {
  const close = state.leads.some((o) => o !== lead && o.lat != null
    && Math.abs(o.lat - lead.lat) < 0.004 && Math.abs(o.lng - lead.lng) < 0.03 && o.lng > lead.lng);
  return close ? 'left' : 'right';
}

function renderMarkers() {
  for (const lead of state.leads) {
    if (lead.lat == null) continue;
    const side = labelSide(lead);
    const m = L.marker([lead.lat, lead.lng], { icon: markerIcon(lead, false), title: lead.name })
      .bindTooltip(shortName(lead), { permanent: true, direction: side, offset: [side === 'left' ? -14 : 14, 0], className: 'pin-label' })
      .on('click', () => select(lead.id));
    state.markers.set(lead.id, m);
  }
  applyFilters();
  const pts = state.leads.filter((l) => l.lat != null).map((l) => [l.lat, l.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [40, 40] });
}

// Les étiquettes ne s'affichent qu'à partir d'un certain zoom pour éviter les chevauchements.
function updateLabels() {
  document.body.classList.toggle('hide-labels', map.getZoom() < 12);
}
map.on('zoomend', updateLabels);

// --- Liste et filtres --------------------------------------------------------

function matches(lead, q, waves) {
  if (!waves.has(lead.wave)) return false;
  if (!q) return true;
  const hay = [lead.name, lead.address, lead.municipality, lead.companies, lead.owner].join(' ').toLowerCase();
  return hay.includes(q);
}

function applyFilters() {
  const q = $('#search').value.trim().toLowerCase();
  const waves = new Set([...document.querySelectorAll('[data-wave]')].filter((i) => i.checked).map((i) => Number(i.dataset.wave)));
  const list = $('#lead-list');
  list.innerHTML = '';
  const order = { A: 0, B: 1, C: 2 };
  const visible = state.leads
    .filter((l) => matches(l, q, waves))
    .sort((a, b) => a.wave - b.wave || order[a.priority] - order[b.priority]);

  for (const lead of state.leads) {
    const m = state.markers.get(lead.id);
    if (!m) continue;
    if (visible.includes(lead)) m.addTo(map); else m.remove();
  }

  for (const lead of visible) {
    const li = document.createElement('li');
    li.className = lead.id === state.selectedId ? 'active' : '';
    const mine = state.mine.some((c) => c.leadId === lead.id);
    li.innerHTML = `
      <i class="dot prio-${esc(lead.priority)}"></i>
      <div>
        <strong>${esc(shortName(lead))}</strong>
        <small>${esc(lead.municipality)} · Vague ${lead.wave} · Prio ${esc(lead.priority)}</small>
      </div>
      ${mine ? '<span class="badge mine" title="Vous avez déjà proposé un contact">✓</span>'
        : lead.contributionCount ? `<span class="badge" title="Contacts déjà proposés">${lead.contributionCount}</span>` : ''}`;
    li.addEventListener('click', () => select(lead.id));
    list.appendChild(li);
  }
  if (!visible.length) list.innerHTML = '<li class="empty">Aucun immeuble ne correspond.</li>';
}

$('#search').addEventListener('input', applyFilters);
document.querySelectorAll('[data-wave]').forEach((i) => i.addEventListener('change', applyFilters));

// --- Fiche immeuble ----------------------------------------------------------

function select(id) {
  const prev = state.selectedId && state.leads.find((l) => l.id === state.selectedId);
  if (prev && state.markers.get(prev.id)) state.markers.get(prev.id).setIcon(markerIcon(prev, false));
  state.selectedId = id;
  const lead = state.leads.find((l) => l.id === id);
  const m = state.markers.get(id);
  if (m) {
    m.setIcon(markerIcon(lead, true));
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 14), { duration: 0.5 });
  }
  renderPanel(lead);
  applyFilters();
}

function row(label, value) {
  if (value == null || value === '') return '';
  return `<div class="kv"><dt>${esc(label)}</dt><dd>${typeof value === 'number' ? fmt(value) : esc(value)}</dd></div>`;
}

function renderPanel(lead) {
  const mine = state.mine.filter((c) => c.leadId === lead.id);
  $('#panel-body').innerHTML = `
    <div class="panel-head">
      <span class="tag prio-${esc(lead.priority)}">Prio ${esc(lead.priority)}</span>
      <span class="tag">Vague ${lead.wave}</span>
      <h2>${esc(lead.name)}</h2>
      <p class="muted">${esc(lead.address)}, ${esc(lead.municipality)}</p>
    </div>
    <p class="pitch">${esc(lead.pitch)}</p>
    <dl>
      ${row('Société(s) identifiée(s)', lead.companies)}
      ${row('Propriétaire / gestionnaire', lead.owner)}
      ${row('Rôle visé dans CityWatt', lead.role)}
      ${row('Fonction à viser', lead.targetFunction)}
      ${row('Solaire (kWc)', lead.solarKwp)}
      ${row('Production estimée (MWh/an)', lead.productionMwh)}
      ${row('Consommation — borne basse (MWh/an)', lead.consumptionMwh)}
    </dl>
    ${lead.status ? `<div class="status"><strong>Où nous en sommes</strong><p>${esc(lead.status)}</p></div>` : ''}
    ${lead.contributionCount ? `<p class="muted small">${lead.contributionCount} contact(s) déjà proposé(s) pour cet immeuble.</p>` : ''}
    ${mine.length ? `<div class="mine-list"><strong>Vos propositions</strong><ul>${mine.map((c) =>
      `<li>${esc(c.contactName)} — ${c.mode === 'intro' ? 'introduction' : 'contact transmis'}</li>`).join('')}</ul></div>` : ''}
    <div id="form-slot"></div>`;
  mountForm(lead);
  $('#panel').hidden = false;
  $('#panel').scrollTop = 0;
}

function mountForm(lead) {
  const form = $('#form-template').content.firstElementChild.cloneNode(true);
  const fields = $('.fields', form);
  const setMode = (mode) => {
    fields.hidden = false;
    form.dataset.mode = mode;
    form.querySelectorAll('.path').forEach((p) => p.classList.toggle('checked', $('input', p).checked));
  };
  form.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', () => setMode(r.value)));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.leadId = lead.id;
    body.mentionName = fd.has('mentionName');
    const err = $('.error', form);
    err.textContent = '';
    try {
      const saved = await api('/api/contributions', { method: 'POST', body: JSON.stringify(body) });
      state.mine.push(saved);
      lead.contributionCount = (lead.contributionCount || 0) + 1;
      renderPanel(lead);
      applyFilters();
      $('#form-slot').insertAdjacentHTML('afterbegin',
        `<div class="success">Merci ! ${body.mode === 'intro'
          ? 'Nous revenons vers vous pour préparer l’introduction.'
          : 'Nous prenons contact et vous tenons au courant.'} Vous pouvez ajouter un autre contact ci-dessous.</div>`);
    } catch (ex) {
      if (ex.status === 401) return showLogin();
      err.textContent = ex.message;
    }
  });
  $('#form-slot').appendChild(form);
}

$('#panel-close').addEventListener('click', () => {
  $('#panel').hidden = true;
  const lead = state.leads.find((l) => l.id === state.selectedId);
  if (lead && state.markers.get(lead.id)) state.markers.get(lead.id).setIcon(markerIcon(lead, false));
  state.selectedId = null;
  applyFilters();
});

// --- Session -----------------------------------------------------------------

function showLogin() {
  $('#login').hidden = false;
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  try {
    state.user = await api('/api/login', { method: 'POST', body: JSON.stringify(body) });
    $('#login').hidden = true;
    await start();
  } catch (ex) {
    $('#login-error').textContent = ex.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  location.reload();
});

async function start() {
  $('#user-name').textContent = state.user.name;
  $('#admin-link').hidden = state.user.role !== 'admin';
  [state.leads, state.mine] = await Promise.all([api('/api/leads'), api('/api/contributions/mine')]);
  renderMarkers();
  updateLabels();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && state.leads.some((l) => l.id === hash)) select(hash);
}

(async () => {
  try {
    state.user = await api('/api/me');
    await start();
  } catch {
    showLogin();
  }
})();
