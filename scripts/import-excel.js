// Convertit l'onglet « Immeubles » de l'Excel en data/leads.json.
// Usage : npm run import -- [chemin/vers/fichier.xlsx]
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const xlsxPath = process.argv[2] || path.join(DATA_DIR, 'leads.xlsx');
const coords = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'coordinates.json'), 'utf8'));

// En-tête Excel -> champ JSON
const COLUMNS = {
  'Vague': 'wave',
  'Prio': 'priority',
  'Immeuble / site': 'name',
  'Adresse': 'address',
  'Commune': 'municipality',
  'Solaire (kWc)': 'solarKwp',
  'Production est. (MWh/an)': 'productionMwh',
  'Société(s) identifiée(s)': 'companies',
  'Conso — borne basse (MWh/an)': 'consumptionMwh',
  'Rôle visé dans CityWatt': 'role',
  'Propriétaire / gestionnaire': 'owner',
  "Angle d'entrée": 'pitch',
  'Fonction à viser': 'targetFunction',
  'Où nous en sommes': 'status',
};

function slugify(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cellValue(cell) {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
  if (typeof v === 'object' && 'result' in v) return v.result;
  return typeof v === 'string' ? v.trim() : v;
}

const q = (v) => (v == null || v === '' ? 'null'
  : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// Script à coller dans le SQL Editor de Supabase : met à jour les immeubles sans toucher aux contacts.
function toSql(leads) {
  const cols = ['id', 'wave', 'priority', 'name', 'address', 'municipality', 'solar_kwp', 'production_mwh',
    'companies', 'consumption_mwh', 'target_role', 'owner', 'pitch', 'target_function', 'lat', 'lng'];
  const rows = leads.map((l) => `  (${[l.id, l.wave, l.priority, l.name, l.address, l.municipality, l.solarKwp,
    l.productionMwh, l.companies, l.consumptionMwh, l.role, l.owner, l.pitch, l.targetFunction, l.lat, l.lng]
    .map(q).join(', ')})`);
  const updates = cols.slice(1).map((c) => `${c} = excluded.${c}`).concat('updated_at = now()');
  return `-- Généré par « npm run import » à partir de data/leads.xlsx. À coller dans Supabase → SQL Editor.
begin;

insert into public.amb_leads (${cols.join(', ')}) values
${rows.join(',\n')}
on conflict (id) do update set
  ${updates.join(',\n  ')};

insert into public.amb_lead_status (lead_id, status) values
${leads.map((l) => `  (${q(l.id)}, ${q(l.status)})`).join(',\n')}
on conflict (lead_id) do update set status = excluded.status;

-- Les immeubles retirés de l'Excel ne sont pas supprimés (leurs contacts seraient perdus).
-- Pour en retirer un : delete from public.amb_leads where id = '...';

commit;
`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.getWorksheet('Immeubles');
  if (!ws) throw new Error('Onglet « Immeubles » introuvable');

  const header = [];
  ws.getRow(1).eachCell((cell, col) => { header[col] = COLUMNS[cellValue(cell)]; });

  const leads = [];
  const missingCoords = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const lead = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (header[col]) lead[header[col]] = cellValue(cell);
    });
    // Ignore la ligne de légende en bas du tableau
    if (!lead.name || typeof lead.wave !== 'number') return;
    lead.id = slugify(lead.name);
    if (lead.companies === '/') lead.companies = null;
    const c = coords[lead.name];
    if (c) [lead.lat, lead.lng] = c;
    else missingCoords.push(lead.name);
    leads.push(lead);
  });

  fs.writeFileSync(path.join(DATA_DIR, 'leads.json'), JSON.stringify(leads, null, 2) + '\n');
  console.log(`${leads.length} immeubles écrits dans data/leads.json`);
  fs.writeFileSync(path.join(__dirname, '..', 'supabase', 'immeubles.sql'), toSql(leads));
  console.log('Script Supabase écrit dans supabase/immeubles.sql');
  if (missingCoords.length) {
    console.warn('Coordonnées manquantes dans data/coordinates.json pour :');
    missingCoords.forEach((n) => console.warn(`  - ${n}`));
  }
}

main().catch((err) => { console.error(err.message); process.exit(1); });
