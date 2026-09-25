const state = {
  user: null, map: null,
  leads: [], markers: new Map(), selectedId: null, mine: [],
  suggestions: [], suggMarkers: new Map(),
  members: [], memberMarkers: [],
  draft: null, // lieu en cours de proposition : { lat, lng, marker }
};

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

// --- Marqueurs ------------------------------------------------------------------

function leadHtml(lead, selected) {
  return `<div class="pin prio-${esc(lead.priority)}${selected ? ' selected' : ''}${lead.convertedAt ? ' converted' : ''}">${lead.wave === 1 ? '1' : '2'}</div>`
    + `<span class="mk-label ${labelSide(lead)}">${esc(shortName(lead))}</span>`;
}

function suggHtml(s, selected) {
  return `<div class="pin sugg${selected ? ' selected' : ''}${s.follow_up === 'Converti' ? ' converted' : ''}">+</div><span class="mk-label right">${esc(s.place_name)}</span>`;
}

// Quand deux immeubles sont très proches, l'étiquette du plus à l'ouest passe à gauche.
function labelSide(lead) {
  const close = state.leads.some((o) => o !== lead && o.lat != null
    && Math.abs(o.lat - lead.lat) < 0.004 && Math.abs(o.lng - lead.lng) < 0.03 && o.lng > lead.lng);
  return close ? 'left' : 'right';
}

function renderMarkers() {
  const map = state.map;
  // Membres d'abord, pour qu'ils restent sous les immeubles.
  state.memberMarkers = state.members.map((m) => map.addMarker({
    lat: m.lat, lng: m.lng, zIndex: 1,
    html: '<div class="member-dot"></div>',
    title: m.name ? `${m.name} — ${m.operation}` : `Membre — ${m.operation}`,
  }));
  for (const lead of state.leads) {
    if (lead.lat == null) continue;
    state.markers.set(lead.id, map.addMarker({
      lat: lead.lat, lng: lead.lng, html: leadHtml(lead, false), title: lead.name, zIndex: 10,
      onClick: () => select(lead.id),
    }));
  }
  state.suggestions.forEach(addSuggestionMarker);
  applyFilters();
  const pts = state.leads.filter((l) => l.lat != null).map((l) => [l.lat, l.lng]);
  if (pts.length) map.fitBounds(pts);
}

function addSuggestionMarker(s) {
  const m = state.map.addMarker({
    lat: s.lat, lng: s.lng, html: suggHtml(s, false), title: s.place_name, zIndex: 20,
    onClick: () => selectSuggestion(s.id),
  });
  state.suggMarkers.set(s.id, m);
  return m;
}

// Les étiquettes ne s'affichent qu'à partir d'un certain zoom pour éviter les chevauchements.
function updateLabels() {
  document.body.classList.toggle('hide-labels', state.map.getZoom() < 12);
}

// --- Liste et filtres --------------------------------------------------------

// Points convertis : retirés de la carte. Seule l'équipe peut les réafficher.
const showConverted = () => state.user.role === 'admin' && $('#show-converted').checked;

function matches(lead, q, waves) {
  if (!waves.has(lead.wave)) return false;
  if (lead.convertedAt && !showConverted()) return false;
  if (!q) return true;
  const hay = [lead.name, lead.address, lead.municipality, lead.companies, lead.owner].join(' ').toLowerCase();
  return hay.includes(q);
}

function applyFilters() {
  const q = $('#search').value.trim().toLowerCase();
  const waves = new Set([...document.querySelectorAll('[data-wave]')].filter((i) => i.checked).map((i) => Number(i.dataset.wave)));
  const showMembers = $('#show-members').checked;
  const showSugg = $('#show-suggestions').checked;
  const order = { A: 0, B: 1, C: 2 };
  const visible = state.leads
    .filter((l) => matches(l, q, waves))
    .sort((a, b) => a.wave - b.wave || order[a.priority] - order[b.priority]);

  for (const lead of state.leads) {
    const m = state.markers.get(lead.id);
    if (m) (visible.includes(lead) ? m.show() : m.hide());
  }
  state.memberMarkers.forEach((m) => (showMembers ? m.show() : m.hide()));
  const visibleSugg = state.suggestions.filter((s) => showSugg
    && (s.follow_up !== 'Converti' || showConverted())
    && (!q || s.place_name.toLowerCase().includes(q)));
  state.suggestions.forEach((s) => {
    const m = state.suggMarkers.get(s.id);
    if (m) (visibleSugg.includes(s) ? m.show() : m.hide());
  });

  const list = $('#lead-list');
  list.innerHTML = '';
  for (const lead of visible) {
    const li = document.createElement('li');
    li.className = lead.id === state.selectedId ? 'active' : '';
    const mine = state.mine.some((c) => c.lead_id === lead.id);
    li.innerHTML = `
      <i class="dot prio-${esc(lead.priority)}"></i>
      <div>
        <strong>${esc(shortName(lead))}</strong>
        <small>${lead.convertedAt ? 'Converti · ' : ''}${esc(lead.municipality)} · Vague ${lead.wave} · Prio ${esc(lead.priority)}</small>
      </div>
      ${mine ? '<span class="badge mine" title="Vous avez déjà proposé un contact">✓</span>'
        : lead.contributionCount ? `<span class="badge" title="Contacts déjà proposés">${lead.contributionCount}</span>` : ''}`;
    li.addEventListener('click', () => select(lead.id));
    list.appendChild(li);
  }
  if (visibleSugg.length) {
    list.insertAdjacentHTML('beforeend', `<li class="list-title">${state.user.role === 'admin' ? 'Lieux proposés' : 'Vos lieux proposés'}</li>`);
    for (const s of visibleSugg) {
      const li = document.createElement('li');
      li.className = s.id === state.selectedId ? 'active' : '';
      li.innerHTML = `<i class="dot sugg"></i><div><strong>${esc(s.place_name)}</strong>
        <small>${esc(s.follow_up)}${state.user.role === 'admin' ? ` · par ${esc(s.author_name)}` : ''}</small></div>`;
      li.addEventListener('click', () => selectSuggestion(s.id));
      list.appendChild(li);
    }
  }
  if (!visible.length && !visibleSugg.length) list.innerHTML = '<li class="empty">Aucun résultat.</li>';
}

$('#search').addEventListener('input', applyFilters);
document.querySelectorAll('.filters input').forEach((i) => i.addEventListener('change', applyFilters));

// --- Sélection ---------------------------------------------------------------

function clearSelection() {
  const lead = state.leads.find((l) => l.id === state.selectedId);
  if (lead) state.markers.get(lead.id)?.setHtml(leadHtml(lead, false));
  const s = state.suggestions.find((x) => x.id === state.selectedId);
  if (s) state.suggMarkers.get(s.id)?.setHtml(suggHtml(s, false));
  state.selectedId = null;
}

function select(id) {
  cancelDraft();
  clearSelection();
  state.selectedId = id;
  const lead = state.leads.find((l) => l.id === id);
  state.markers.get(id)?.setHtml(leadHtml(lead, true));
  state.map.flyTo(lead.lat, lead.lng, 14);
  renderPanel(lead);
  applyFilters();
}

function selectSuggestion(id) {
  cancelDraft();
  clearSelection();
  state.selectedId = id;
  const s = state.suggestions.find((x) => x.id === id);
  state.suggMarkers.get(id)?.setHtml(suggHtml(s, true));
  state.map.flyTo(s.lat, s.lng, 15);
  $('#panel-body').innerHTML = `
    <div class="panel-head">
      <span class="tag sugg">Lieu proposé</span>
      <span class="tag">${esc(s.follow_up)}</span>
      <h2>${esc(s.place_name)}</h2>
      ${s.address ? `<p class="muted">${esc(s.address)}</p>` : ''}
    </div>
    ${s.reason ? `<p class="pitch">${esc(s.reason)}</p>` : ''}
    <dl>
      ${row('Proposé par', s.author_name)}
      ${row('Le', new Date(s.created_at).toLocaleDateString('fr-BE'))}
      ${row('Contact sur place', s.has_contact ? [s.contact_name, s.contact_function].filter(Boolean).join(', ') : 'Pas de contact')}
      ${s.has_contact ? row('Coordonnées', [s.contact_email, s.contact_phone].filter(Boolean).join(' · ')) : ''}
      ${s.has_contact ? row('Lien', s.relation) : ''}
    </dl>
    ${s.team_notes && state.user.role === 'admin' ? `<div class="status"><strong>Notes équipe</strong><p>${esc(s.team_notes)}</p></div>` : ''}
    <p class="muted small">L’équipe CityWatt suit ce lieu. Le statut évolue au fil de la prospection.</p>
    ${adminConvertBlock(s.follow_up === 'Converti', 'Converti : retirer de la carte', 'Remettre sur la carte', 'convert-sugg',
      '<button type="button" class="btn secondary" id="promote-sugg">Transformer en immeuble</button>')}`;
  $('#promote-sugg')?.addEventListener('click', () => startLeadForm(null, {
    name: s.place_name, address: s.address, lat: s.lat, lng: s.lng, pitch: s.reason, fromSuggestion: s.id,
  }));
  $('#convert-sugg')?.addEventListener('click', async () => {
    const convert = s.follow_up !== 'Converti';
    const followUp = convert ? 'Converti' : 'Retenu';
    const { error } = await sb.from('amb_suggestions').update({ follow_up: followUp }).eq('id', s.id);
    if (error) { console.error(error); alert('Modification non enregistrée.'); return; }
    s.follow_up = followUp;
    afterConvert(() => selectSuggestion(s.id), convert);
  });
  openPanel();
  applyFilters();
}

function row(label, value) {
  if (value == null || value === '') return '';
  return `<div class="kv"><dt>${esc(label)}</dt><dd>${typeof value === 'number' ? fmt(value) : esc(value)}</dd></div>`;
}

function adminConvertBlock(isConverted, convertLabel, restoreLabel, id, extraButton = '') {
  if (state.user.role !== 'admin') return '';
  return `<div class="admin-actions"><strong>Équipe</strong>
    ${isConverted ? '<p class="muted small">Converti : masqué sur la carte des actionnaires et ambassadeurs.</p>' : ''}
    <div class="admin-buttons">${extraButton}
    <button type="button" class="btn secondary" id="${id}">${isConverted ? restoreLabel : convertLabel}</button></div></div>`;
}

// Après conversion, le point disparaît : on ferme la fiche (sauf si l'équipe affiche les convertis).
function afterConvert(reopen, converted) {
  if (converted && !showConverted()) {
    $('#panel').hidden = true;
    clearSelection();
    applyFilters();
  } else {
    reopen();
  }
}

function openPanel() {
  $('#panel').hidden = false;
  $('#panel').scrollTop = 0;
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
    ${adminConvertBlock(lead.convertedAt,
      'Converti : retirer de la carte', 'Remettre sur la carte', 'convert-lead',
      '<button type="button" class="btn secondary" id="edit-lead">Modifier l’immeuble</button>')}
    <div id="form-slot"></div>`;
  $('#edit-lead')?.addEventListener('click', () => startLeadForm(lead));
  $('#convert-lead')?.addEventListener('click', async () => {
    const convert = !lead.convertedAt;
    if (convert && !confirm('Marquer cet immeuble comme converti ? Il disparaît de la carte pour les actionnaires et ambassadeurs.')) return;
    const { error } = await sb.rpc('amb_set_lead_converted', { p_id: lead.id, p_converted: convert });
    if (error) { console.error(error); alert('Modification non enregistrée.'); return; }
    lead.convertedAt = convert ? new Date().toISOString() : null;
    afterConvert(() => select(lead.id), convert);
  });
  mountForm(lead);
  openPanel();
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
  cancelDraft();
  clearSelection();
  applyFilters();
});

// --- Proposer un lieu (bouton « + ») -----------------------------------------------

function draftHtml(kind) {
  return kind === 'lead'
    ? '<div class="pin prio-A selected">?</div><span class="mk-label right">Emplacement de l’immeuble</span>'
    : '<div class="pin sugg selected">+</div><span class="mk-label right">Nouveau lieu</span>';
}

function placeDraft(lat, lng) {
  state.draft?.marker.hide();
  const kind = $('#place-form')?.dataset.kind;
  state.draft = { lat, lng, marker: state.map.addMarker({ lat, lng, html: draftHtml(kind), zIndex: 30 }) };
  state.draft.marker.show();
  const form = $('#place-form');
  if (form) {
    form.querySelector('.where').textContent = 'Point placé sur la carte. Cliquez ailleurs pour le déplacer.';
    form.querySelector('.where').classList.remove('error');
  }
}

function cancelDraft() {
  if (!state.draft && !document.body.classList.contains('placing')) return;
  state.draft?.marker.hide();
  state.draft = null;
  state.map.onMapClick(null);
  document.body.classList.remove('placing');
}

function startSuggestion() {
  clearSelection();
  applyFilters();
  document.body.classList.add('placing');
  state.map.onMapClick(placeDraft);

  const form = $('#sugg-template').content.firstElementChild.cloneNode(true);
  form.id = 'place-form';
  const f = form.elements;
  $('#panel-body').innerHTML = '';
  $('#panel-body').appendChild(form);
  openPanel();

  const contactFields = $('.contact-fields', form);
  f.hasContact.forEach((r) => r.addEventListener('change', () => {
    contactFields.hidden = f.hasContact.value !== 'yes';
    form.querySelectorAll('.path').forEach((p) => p.classList.toggle('checked', $('input', p).checked));
  }));

  wireLocate(form, () => [f.address.value, f.placeName.value], f.address);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.error', form);
    err.textContent = '';
    if (!state.draft) { err.textContent = 'Placez le lieu sur la carte (clic sur la carte ou bouton « Localiser »).'; return; }
    const hasContact = f.hasContact.value === 'yes';
    const row = {
      place_name: f.placeName.value.trim(),
      address: f.address.value.trim() || null,
      lat: state.draft.lat,
      lng: state.draft.lng,
      reason: f.reason.value.trim() || null,
      has_contact: hasContact,
      contact_name: hasContact ? f.contactName.value.trim() || null : null,
      contact_function: hasContact ? f.contactFunction.value.trim() || null : null,
      contact_email: hasContact ? f.contactEmail.value.trim() || null : null,
      contact_phone: hasContact ? f.contactPhone.value.trim() || null : null,
      relation: hasContact ? f.relation.value.trim() || null : null,
    };
    if (hasContact && !row.contact_name) { err.textContent = 'Indiquez le nom de votre contact.'; return; }
    const { data: saved, error } = await sb.from('amb_suggestions').insert(row).select().single();
    if (error) { console.error(error); err.textContent = 'L’envoi a échoué. Réessayez dans un instant.'; return; }
    cancelDraft();
    state.suggestions.push(saved);
    addSuggestionMarker(saved);
    $('#show-suggestions').checked = true;
    selectSuggestion(saved.id);
    $('#panel-body').insertAdjacentHTML('afterbegin',
      '<div class="success">Merci ! Le lieu est transmis à l’équipe CityWatt.</div>');
  });
}

$('#add-place').addEventListener('click', startSuggestion);

// Bouton « Localiser » : cherche l'adresse et place le point ; sinon clic sur la carte.
function wireLocate(form, parts, addressInput) {
  $('.locate', form).addEventListener('click', async () => {
    const q = parts().map((x) => x.trim()).filter(Boolean).join(', ');
    const where = $('.where', form);
    if (!q) { where.textContent = 'Indiquez d’abord une adresse ou un nom de lieu.'; where.classList.add('error'); return; }
    where.textContent = 'Recherche…';
    const hit = await state.map.geocode(`${q}, Belgique`);
    if (!hit) { where.textContent = 'Adresse introuvable : cliquez directement sur la carte.'; where.classList.add('error'); return; }
    placeDraft(hit.lat, hit.lng);
    state.map.flyTo(hit.lat, hit.lng, 16);
    if (!addressInput.value.trim()) addressInput.value = hit.address;
  });
}

// --- Immeubles : ajout et modification par l'équipe ----------------------------------

function slugify(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

const LEAD_FIELDS = [ // champ du formulaire, colonne amb_leads, clé dans state.leads
  ['name', 'name', 'name'], ['address', 'address', 'address'], ['municipality', 'municipality', 'municipality'],
  ['pitch', 'pitch', 'pitch'], ['companies', 'companies', 'companies'], ['owner', 'owner', 'owner'],
  ['targetRole', 'target_role', 'role'], ['targetFunction', 'target_function', 'targetFunction'],
  ['solarKwp', 'solar_kwp', 'solarKwp'],
];

// lead : immeuble à modifier (null pour un nouveau) ; prefill : valeurs de départ (lieu proposé transformé).
function startLeadForm(lead = null, prefill = {}) {
  clearSelection();
  applyFilters();
  document.body.classList.add('placing');
  state.map.onMapClick(placeDraft);

  const form = $('#lead-template').content.firstElementChild.cloneNode(true);
  form.id = 'place-form';
  form.dataset.kind = 'lead';
  const f = form.elements;
  $('#panel-body').innerHTML = '';
  $('#panel-body').appendChild(form);
  openPanel();

  const src = lead || prefill;
  for (const [input, , key] of LEAD_FIELDS) if (src[key] != null) f[input].value = src[key];
  if (src.wave) f.wave.value = String(src.wave);
  if (src.priority) f.priority.value = src.priority;
  if (src.productionMwh != null) f.productionMwh.value = src.productionMwh;
  if (src.consumptionMwh != null) f.consumptionMwh.value = src.consumptionMwh;
  if (src.status) f.status.value = src.status;
  if (lead) $('.form-title', form).textContent = 'Modifier l’immeuble';
  if (src.lat != null) { placeDraft(src.lat, src.lng); state.map.flyTo(src.lat, src.lng, 15); }

  wireLocate(form, () => [f.address.value, f.municipality.value, f.name.value], f.address);

  const del = $('.delete-lead', form);
  del.hidden = !lead;
  del.addEventListener('click', async () => {
    const n = lead.contributionCount ? ` et les ${lead.contributionCount} contact(s) proposé(s) pour lui` : '';
    if (!confirm(`Supprimer définitivement « ${lead.name} »${n} ? Pour le garder en historique, utilisez plutôt « Converti ».`)) return;
    const { error } = await sb.from('amb_leads').delete().eq('id', lead.id);
    if (error) { console.error(error); $('.error', form).textContent = 'Suppression impossible.'; return; }
    state.markers.get(lead.id)?.hide();
    state.markers.delete(lead.id);
    state.leads = state.leads.filter((l) => l !== lead);
    cancelDraft();
    $('#panel').hidden = true;
    applyFilters();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.error', form);
    err.textContent = '';
    if (!state.draft) { err.textContent = 'Placez l’immeuble sur la carte (clic sur la carte ou bouton « Localiser »).'; return; }
    const num = (v) => (v === '' ? null : Number(v));
    const row = {
      id: lead ? lead.id : `${slugify(f.name.value)}-${Math.random().toString(36).slice(2, 6)}`,
      wave: Number(f.wave.value),
      priority: f.priority.value,
      production_mwh: num(f.productionMwh.value),
      consumption_mwh: num(f.consumptionMwh.value),
      lat: state.draft.lat,
      lng: state.draft.lng,
      updated_at: new Date().toISOString(),
    };
    for (const [input, col] of LEAD_FIELDS) row[col] = f[input].value.trim() || null;
    const { error } = await sb.from('amb_leads').upsert(row);
    if (error) { console.error(error); err.textContent = 'Enregistrement impossible. Réessayez.'; return; }
    const status = f.status.value.trim() || null;
    const st = await sb.from('amb_lead_status').upsert({ lead_id: row.id, status });
    if (st.error) console.error(st.error);

    const saved = {
      ...(lead || { contributionCount: 0, convertedAt: null }),
      id: row.id, wave: row.wave, priority: row.priority, name: row.name, address: row.address,
      municipality: row.municipality, solarKwp: row.solar_kwp, productionMwh: row.production_mwh,
      companies: row.companies, consumptionMwh: row.consumption_mwh, role: row.target_role, owner: row.owner,
      pitch: row.pitch, targetFunction: row.target_function, lat: row.lat, lng: row.lng, status,
    };
    if (lead) {
      Object.assign(lead, saved);
      state.markers.get(lead.id)?.hide(); // position ou étiquette modifiée : on recrée le marqueur
    } else {
      state.leads.push(saved);
    }
    const target = lead || saved;
    state.markers.set(target.id, state.map.addMarker({
      lat: target.lat, lng: target.lng, html: leadHtml(target, false), title: target.name, zIndex: 10,
      onClick: () => select(target.id),
    }));
    if (prefill.fromSuggestion) await markSuggestionConverted(prefill.fromSuggestion);
    cancelDraft();
    select(target.id);
    $('#panel-body').insertAdjacentHTML('afterbegin', `<div class="success">Immeuble ${lead ? 'modifié' : 'ajouté'}.</div>`);
  });
}

async function markSuggestionConverted(id) {
  const s = state.suggestions.find((x) => x.id === id);
  const { error } = await sb.from('amb_suggestions').update({ follow_up: 'Converti' }).eq('id', id);
  if (error) { console.error(error); return; }
  if (s) s.follow_up = 'Converti';
}

$('#add-lead').addEventListener('click', () => startLeadForm());

// --- Session -----------------------------------------------------------------

async function loadData() {
  const [leads, status, counts, mine, sugg, members] = await Promise.all([
    sb.from('amb_leads').select('*'),
    sb.from('amb_lead_status').select('*'), // vide pour les ambassadeurs (règle RLS)
    sb.rpc('amb_lead_counts'),
    sb.from('amb_contributions').select('*').eq('author_id', state.user.id),
    sb.from('amb_suggestions').select('*').order('created_at'), // les siens, ou tous pour l'équipe (RLS)
    sb.rpc('amb_community_members'),
  ]);
  for (const r of [leads, status, counts, mine, sugg, members]) if (r.error) throw r.error;
  const statusById = new Map(status.data.map((s) => [s.lead_id, s.status]));
  const countById = new Map(counts.data.map((c) => [c.lead_id, Number(c.n)]));
  state.leads = leads.data.map((l) => ({
    id: l.id, wave: l.wave, priority: l.priority, name: l.name, address: l.address,
    municipality: l.municipality, solarKwp: l.solar_kwp, productionMwh: l.production_mwh,
    companies: l.companies, consumptionMwh: l.consumption_mwh, role: l.target_role, owner: l.owner,
    pitch: l.pitch, targetFunction: l.target_function, lat: l.lat, lng: l.lng, convertedAt: l.converted_at,
    status: statusById.get(l.id) || null,
    contributionCount: countById.get(l.id) || 0,
  }));
  state.mine = mine.data;
  state.suggestions = sugg.data;
  state.members = members.data;
  $('#members-count').textContent = state.members.length;
}

function showMessage(html) {
  $('#login').hidden = false;
  // Nouveau formulaire vierge : on se débarrasse des écouteurs du formulaire de connexion.
  const old = $('#login-form');
  const form = old.cloneNode(false);
  old.replaceWith(form);
  form.innerHTML = `<h1>CityWatt <span>Ambassadeurs</span></h1>${html}
    <button type="button" class="link" style="margin-top:12px" onclick="signOut()">Se déconnecter</button>`;
}

// Compte connecté mais pas (encore) autorisé : demande d'accès, validée à la main par l'équipe.
async function showAccessRequest(user) {
  const { data: req } = await sb.from('amb_access_requests').select('status').eq('user_id', user.id).maybeSingle();
  if (req?.status === 'pending') {
    return showMessage(`<p>Votre demande d’accès est bien reçue.</p>
      <p class="muted">L’équipe CityWatt la valide à la main. Vous recevrez une réponse rapidement ; revenez ensuite sur cette page.</p>`);
  }
  if (req?.status === 'rejected') {
    return showMessage('<p>Votre demande d’accès n’a pas été acceptée.</p><p class="muted">Pour en parler : eric.rw@raysun.solar</p>');
  }
  showMessage(`<p>Votre compte (${esc(user.email)}) n’a pas encore accès à l’espace ambassadeurs.</p>
    <p class="muted">Présentez-vous en quelques mots : l’équipe CityWatt valide chaque demande.</p>
    <label>Nom et prénom <input name="name" required></label>
    <label>Société / organisation <input name="company"></label>
    <label>Vous êtes
      <select name="requestedRole">
        <option value="ambassador">Ambassadeur (non-actionnaire)</option>
        <option value="shareholder">Actionnaire</option>
      </select>
    </label>
    <label>Comment connaissez-vous CityWatt ? <textarea name="message" rows="3"></textarea></label>
    <p class="error"></p>
    <button type="submit" class="btn primary">Demander l’accès</button>`);
  const form = $('#login-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = form.elements;
    const { error } = await sb.from('amb_access_requests').insert({
      name: f.name.value.trim(),
      company: f.company.value.trim() || null,
      requested_role: f.requestedRole.value,
      message: f.message.value.trim() || null,
    });
    if (error) { console.error(error); $('.error', form).textContent = 'L’envoi a échoué. Réessayez dans un instant.'; return; }
    showAccessRequest(user);
  };
}

async function start() {
  const who = await currentMember();
  if (!who) { $('#login').hidden = false; return; }
  if (!who.member) return showAccessRequest(who.user);
  state.user = { id: who.user.id, ...who.member };
  $('#login').hidden = true;
  $('#user-name').textContent = state.user.name;
  $('#admin-link').hidden = state.user.role !== 'admin';
  $('#converted-filter').hidden = state.user.role !== 'admin';
  $('#add-lead').hidden = state.user.role !== 'admin';
  $('#tracker-link').hidden = state.user.role !== 'admin';
  const [map] = await Promise.all([createMap($('#map')), loadData()]);
  state.map = map;
  map.onZoom(updateLabels);
  renderMarkers();
  updateLabels();
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('lieu-')) {
    if (state.suggestions.some((s) => s.id === hash.slice(5))) selectSuggestion(hash.slice(5));
  } else if (hash && state.leads.some((l) => l.id === hash)) select(hash);
}

$('#logout').addEventListener('click', signOut);
wireLoginForm(() => start().catch(showError));

function showError(e) {
  console.error(e);
  showMessage('<p class="error">Impossible de charger les données. Réessayez dans un instant.</p>');
}

start().catch(showError);
