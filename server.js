const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const ExcelJS = require('exceljs');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
const CONTRIB_FILE = path.join(DATA_DIR, 'contributions.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

// Un code d'accès par public. Le rôle détermine ce que la personne voit.
const ACCESS_CODES = {
  [process.env.SHAREHOLDER_CODE || 'actionnaire']: 'shareholder',
  [process.env.AMBASSADOR_CODE || 'ambassadeur']: 'ambassador',
  [process.env.ADMIN_CODE || 'admin']: 'admin',
};

// Champs internes masqués aux ambassadeurs (non-actionnaires).
const INTERNAL_FIELDS = ['status'];

const MODES = { intro: 'Je fais l’introduction', contact: 'Je vous donne le contact' };
const STRENGTHS = ['Fort', 'Moyen', 'Faible'];
const FOLLOW_UP = ['Nouveau', 'En cours', 'Rendez-vous obtenu', 'Sans suite'];

// --- Stockage --------------------------------------------------------------

const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
const leadsById = new Map(leads.map((l) => [l.id, l]));

function readContributions() {
  try {
    return JSON.parse(fs.readFileSync(CONTRIB_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeContributions(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CONTRIB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, CONTRIB_FILE);
}

// --- Session (cookie signé HMAC, sans dépendance) --------------------------

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function auth(req, res, next) {
  const user = verify(readCookie(req, 'cw_session'));
  if (!user) return res.status(401).json({ error: 'Non connecté' });
  req.user = user;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Réservé à l’équipe' });
  next();
}

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// --- App -------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist')));

app.post('/api/login', (req, res) => {
  req.body = req.body || {};
  const name = str(req.body.name, 120);
  const email = str(req.body.email, 200);
  const role = ACCESS_CODES[str(req.body.code, 100)];
  if (!name) return res.status(400).json({ error: 'Merci d’indiquer votre nom' });
  if (!role) return res.status(401).json({ error: 'Code d’accès incorrect' });
  const user = { name, email, role };
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `cw_session=${encodeURIComponent(sign(user))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 90}${secure}`);
  res.json(user);
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'cw_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

app.get('/api/leads', auth, (req, res) => {
  const contributions = readContributions();
  const counts = {};
  for (const c of contributions) counts[c.leadId] = (counts[c.leadId] || 0) + 1;
  const hideInternal = req.user.role === 'ambassador';
  res.json(leads.map((lead) => {
    const out = { ...lead, contributionCount: counts[lead.id] || 0 };
    if (hideInternal) INTERNAL_FIELDS.forEach((f) => delete out[f]);
    return out;
  }));
});

app.get('/api/contributions/mine', auth, (req, res) => {
  const mine = readContributions().filter((c) => c.author.name === req.user.name && c.author.email === req.user.email);
  res.json(mine);
});

app.post('/api/contributions', auth, (req, res) => {
  const b = req.body || {};
  const lead = leadsById.get(b.leadId);
  if (!lead) return res.status(400).json({ error: 'Immeuble inconnu' });
  if (!MODES[b.mode]) return res.status(400).json({ error: 'Choisissez un des deux chemins' });
  const contactName = str(b.contactName, 150);
  if (!contactName) return res.status(400).json({ error: 'Le nom de votre contact est requis' });
  const contactEmail = str(b.contactEmail, 200);
  const contactPhone = str(b.contactPhone, 50);
  if (b.mode === 'contact' && !contactEmail && !contactPhone) {
    return res.status(400).json({ error: 'Indiquez au moins un email ou un téléphone pour ce contact' });
  }

  const contribution = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    leadId: lead.id,
    leadName: lead.name,
    mode: b.mode,
    contactName,
    contactFunction: str(b.contactFunction, 150),
    contactCompany: str(b.contactCompany, 150),
    contactEmail,
    contactPhone,
    relation: str(b.relation, 500),
    strength: STRENGTHS.includes(b.strength) ? b.strength : '',
    mentionName: b.mode === 'contact' ? Boolean(b.mentionName) : true,
    when: str(b.when, 100),
    remarks: str(b.remarks, 2000),
    author: { name: req.user.name, email: req.user.email, role: req.user.role },
    followUp: 'Nouveau',
  };
  const list = readContributions();
  list.push(contribution);
  writeContributions(list);
  res.status(201).json(contribution);
});

// --- Admin -----------------------------------------------------------------

app.get('/api/admin/contributions', auth, adminOnly, (req, res) => {
  res.json({ contributions: readContributions(), followUpOptions: FOLLOW_UP });
});

app.patch('/api/admin/contributions/:id', auth, adminOnly, (req, res) => {
  const list = readContributions();
  const c = list.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Introuvable' });
  req.body = req.body || {};
  if (req.body.followUp !== undefined) {
    if (!FOLLOW_UP.includes(req.body.followUp)) return res.status(400).json({ error: 'Statut invalide' });
    c.followUp = req.body.followUp;
  }
  if (req.body.teamNotes !== undefined) c.teamNotes = str(req.body.teamNotes, 2000);
  writeContributions(list);
  res.json(c);
});

// Export au format de l'onglet « Vos contacts » de l'Excel d'origine.
app.get('/api/admin/export.xlsx', auth, adminOnly, async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vos contacts');
  ws.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Actionnaire / ambassadeur', key: 'author', width: 24 },
    { header: 'Email', key: 'authorEmail', width: 26 },
    { header: 'Immeuble / société concernée', key: 'lead', width: 36 },
    { header: 'Votre contact (nom)', key: 'contactName', width: 24 },
    { header: 'Sa fonction', key: 'contactFunction', width: 24 },
    { header: 'Société du contact', key: 'contactCompany', width: 22 },
    { header: 'Email du contact', key: 'contactEmail', width: 26 },
    { header: 'Téléphone du contact', key: 'contactPhone', width: 18 },
    { header: 'Comment vous le connaissez', key: 'relation', width: 30 },
    { header: 'Qualité du lien', key: 'strength', width: 12 },
    { header: 'Ce que vous acceptez de faire', key: 'mode', width: 26 },
    { header: 'Peut-on citer votre nom ?', key: 'mentionName', width: 12 },
    { header: 'Quand', key: 'when', width: 16 },
    { header: 'Remarques', key: 'remarks', width: 40 },
    { header: 'Suivi', key: 'followUp', width: 16 },
    { header: 'Notes équipe', key: 'teamNotes', width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const c of readContributions()) {
    ws.addRow({
      date: c.createdAt.slice(0, 10),
      author: c.author.name,
      authorEmail: c.author.email,
      lead: c.leadName,
      contactName: c.contactName,
      contactFunction: c.contactFunction,
      contactCompany: c.contactCompany,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      relation: c.relation,
      strength: c.strength,
      mode: MODES[c.mode],
      mentionName: c.mentionName ? 'Oui' : 'Non',
      when: c.when,
      remarks: c.remarks,
      followUp: c.followUp,
      teamNotes: c.teamNotes || '',
    });
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="CityWatt_contacts_ambassadeurs.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

if (process.env.NODE_ENV === 'production') {
  const missing = ['SESSION_SECRET', 'SHAREHOLDER_CODE', 'AMBASSADOR_CODE', 'ADMIN_CODE'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Variables manquantes en production : ${missing.join(', ')}`);
    process.exit(1);
  }
}

app.listen(PORT, () => {
  if (SESSION_SECRET === 'dev-secret-change-me') console.warn('⚠ SESSION_SECRET non défini : ne pas utiliser en production.');
  console.log(`CityWatt ambassadeurs — http://localhost:${PORT}`);
});
