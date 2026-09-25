const PRIO_COLORS = { A: '#d9480f', B: '#f59f00', C: '#5c7cfa' };

const state = { user: null, leads: [], markers: new Map(), selectedId: null, mine: [] };

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    const mine = state.mine.some((c) => c.lead_id === lead.id);
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
  const mine = state.mine.filter((c) => c.lead_id === lead.id);
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
      `<li>${esc(c.contact_name)} — ${c.mode === 'intro' ? 'introduction' : 'contact transmis'}</li>`).join('')}</ul></div>` : ''}
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
    const v = Object.fromEntries(fd.entries());
    const err = $('.error', form);
    err.textContent = '';
    const row = {
      lead_id: lead.id,
      mode: v.mode,
      contact_name: v.contactName.trim(),
      contact_function: v.contactFunction || null,
      contact_company: v.contactCompany || null,
      contact_email: v.mode === 'contact' ? v.contactEmail || null : null,
      contact_phone: v.mode === 'contact' ? v.contactPhone || null : null,
      relation: v.relation || null,
      strength: v.strength || null,
      mention_name: v.mode === 'contact' ? fd.has('mentionName') : true,
      when_text: v.mode === 'intro' ? v.when || null : null,
      remarks: v.remarks || null,
    };
    if (v.mode === 'contact' && !row.contact_email && !row.contact_phone) {
      err.textContent = 'Indiquez au moins un email ou un téléphone pour ce contact.';
      return;
    }
    const { data: saved, error } = await sb.from('amb_contributions').insert(row).select().single();
    if (error) {
      err.textContent = 'L’envoi a échoué. Réessayez, ou écrivez-nous directement.';
      console.error(error);
      return;
    }
    state.mine.push(saved);
    lead.contributionCount = (lead.contributionCount || 0) + 1;
    renderPanel(lead);
    applyFilters();
    $('#form-slot').insertAdjacentHTML('afterbegin',
      `<div class="success">Merci ! ${v.mode === 'intro'
        ? 'Nous revenons vers vous pour préparer l’introduction.'
        : 'Nous prenons contact et vous tenons au courant.'} Vous pouvez ajouter un autre contact ci-dessous.</div>`);
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

async function loadData() {
  const [leads, status, counts, mine] = await Promise.all([
    sb.from('amb_leads').select('*'),
    sb.from('amb_lead_status').select('*'), // vide pour les ambassadeurs (règle RLS)
    sb.rpc('amb_lead_counts'),
    sb.from('amb_contributions').select('*').eq('author_id', state.user.id),
  ]);
  for (const r of [leads, status, counts, mine]) if (r.error) throw r.error;
  const statusById = new Map(status.data.map((s) => [s.lead_id, s.status]));
  const countById = new Map(counts.data.map((c) => [c.lead_id, Number(c.n)]));
  state.leads = leads.data.map((l) => ({
    id: l.id, wave: l.wave, priority: l.priority, name: l.name, address: l.address,
    municipality: l.municipality, solarKwp: l.solar_kwp, productionMwh: l.production_mwh,
    companies: l.companies, consumptionMwh: l.consumption_mwh, role: l.target_role, owner: l.owner,
    pitch: l.pitch, targetFunction: l.target_function, lat: l.lat, lng: l.lng,
    status: statusById.get(l.id) || null,
    contributionCount: countById.get(l.id) || 0,
  }));
  state.mine = mine.data;
}

function showMessage(html) {
  $('#login').hidden = false;
  $('#login-form').innerHTML = `<h1>CityWatt <span>Ambassadeurs</span></h1>${html}
    <button type="button" class="btn primary" onclick="signOut()">Se déconnecter</button>`;
}

async function start() {
  const who = await currentMember();
  if (!who) { $('#login').hidden = false; return; }
  if (!who.member) {
    return showMessage(`<p>Votre compte (${esc(who.user.email)}) n’a pas encore accès à l’espace ambassadeurs.</p>
      <p class="muted">Écrivez à Eric Rwamucyo — eric.rw@raysun.solar — pour être ajouté.</p>`);
  }
  state.user = { id: who.user.id, ...who.member };
  $('#login').hidden = true;
  $('#user-name').textContent = state.user.name;
  $('#admin-link').hidden = state.user.role !== 'admin';
  await loadData();
  renderMarkers();
  updateLabels();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash && state.leads.some((l) => l.id === hash)) select(hash);
}

$('#logout').addEventListener('click', signOut);
wireLoginForm(() => start().catch(showError));

function showError(e) {
  console.error(e);
  showMessage('<p class="error">Impossible de charger les données. Réessayez dans un instant.</p>');
}

start().catch(showError);
