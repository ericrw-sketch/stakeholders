// Envoie un email à l'équipe (via Odoo) quand un actionnaire ou un ambassadeur ajoute quelque chose.
// Appelée par la base (trigger amb_notify) avec { table, id } uniquement : la fonction relit la ligne
// elle-même et ne notifie qu'une fois, donc un appel forgé ne peut ni inventer ni répéter un email.
//
// Secrets à définir dans Supabase → Edge Functions → Secrets :
//   ODOO_USERNAME   login Odoo de l'utilisateur qui envoie (ex. eric.rw@raysun.solar)
//   ODOO_API_KEY    clé API de cet utilisateur (Odoo → Mon profil → Sécurité du compte → Clés API)
// Optionnels :
//   ODOO_URL        https://raysun.odoo.com par défaut
//   ODOO_DB         raysun par défaut
//   NOTIFY_EMAIL    eric.rw@raysun.solar par défaut (plusieurs adresses séparées par des virgules)
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://citywatt-ambassadeurs.netlify.app';
const ODOO_URL = Deno.env.get('ODOO_URL') ?? 'https://raysun.odoo.com';
const ODOO_DB = Deno.env.get('ODOO_DB') ?? 'raysun';
const NOTIFY_EMAIL = Deno.env.get('NOTIFY_EMAIL') ?? 'eric.rw@raysun.solar';
const ROLES: Record<string, string> = { shareholder: 'Actionnaire', ambassador: 'Ambassadeur', admin: 'Équipe' };

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function table(rows: [string, unknown][]) {
  return '<table cellpadding="4" style="border-collapse:collapse">' + rows
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `<tr><td style="color:#6b7378;vertical-align:top">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('') + '</table>';
}

async function odoo(service: string, method: string, args: unknown[]) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message ?? json.error.message);
  return json.result;
}

async function sendViaOdoo(subject: string, html: string) {
  const login = Deno.env.get('ODOO_USERNAME');
  const key = Deno.env.get('ODOO_API_KEY');
  if (!login || !key) throw new Error('Secrets ODOO_USERNAME / ODOO_API_KEY manquants');
  const uid = await odoo('common', 'login', [ODOO_DB, login, key]);
  if (!uid) throw new Error('Connexion Odoo refusée (login, clé API ou base incorrects)');
  const mailId = await odoo('object', 'execute_kw', [ODOO_DB, uid, key, 'mail.mail', 'create', [{
    subject, body_html: html, email_to: NOTIFY_EMAIL, auto_delete: false,
  }]]);
  // Envoi immédiat ; sinon la file d'attente d'Odoo l'envoie dans les minutes qui suivent.
  await odoo('object', 'execute_kw', [ODOO_DB, uid, key, 'mail.mail', 'send', [[mailId]]]).catch(() => {});
}

async function roleOf(userId: string) {
  const { data } = await sb.from('amb_members').select('role').eq('user_id', userId).maybeSingle();
  return data ? ROLES[data.role] ?? data.role : null;
}

async function compose(tableName: string, r: Record<string, any>) {
  if (tableName === 'amb_contributions') {
    const { data: lead } = await sb.from('amb_leads').select('name').eq('id', r.lead_id).maybeSingle();
    const who = `${r.author_name} (${await roleOf(r.author_id)})`;
    const path = r.mode === 'intro' ? 'fait l’introduction' : 'donne le contact';
    return {
      subject: `[CityWatt] ${r.author_name} ${path} — ${lead?.name ?? r.lead_id}`,
      html: `<p><b>${esc(who)}</b> propose un contact pour <b>${esc(lead?.name)}</b>.</p>` + table([
        ['Chemin', r.mode === 'intro' ? 'Je fais l’introduction' : 'Je vous donne le contact'],
        ['Contact', r.contact_name], ['Fonction', r.contact_function], ['Société', r.contact_company],
        ['Email', r.contact_email], ['Téléphone', r.contact_phone], ['Lien', r.relation],
        ['Qualité du lien', r.strength], ['Quand', r.when_text], ['Remarques', r.remarks],
        ['Peut être cité', r.mode === 'contact' ? (r.mention_name ? 'Oui' : 'Non') : null],
      ]) + `<p><a href="${SITE}/admin.html">Ouvrir le suivi équipe</a></p>`,
    };
  }
  if (tableName === 'amb_suggestions') {
    const who = `${r.author_name} (${await roleOf(r.author_id)})`;
    return {
      subject: `[CityWatt] Nouveau lieu proposé par ${r.author_name} — ${r.place_name}`,
      html: `<p><b>${esc(who)}</b> propose un lieu à prospecter : <b>${esc(r.place_name)}</b>.</p>` + table([
        ['Adresse', r.address], ['Pourquoi', r.reason],
        ['Contact sur place', r.has_contact ? r.contact_name : 'Pas de contact'],
        ['Fonction', r.contact_function], ['Email', r.contact_email], ['Téléphone', r.contact_phone], ['Lien', r.relation],
      ]) + `<p><a href="${SITE}/#lieu-${r.id}">Voir sur la carte</a> · <a href="${SITE}/admin.html">Suivi équipe</a></p>`,
    };
  }
  return {
    subject: `[CityWatt] Demande d’accès à valider — ${r.name}`,
    html: `<p><b>${esc(r.name)}</b> demande l’accès à l’espace ambassadeurs.</p>` + table([
      ['Email', r.email], ['Société', r.company], ['Se présente comme', ROLES[r.requested_role]], ['Message', r.message],
    ]) + `<p><a href="${SITE}/admin.html">Accepter ou refuser</a></p>`,
  };
}

const TABLES = ['amb_contributions', 'amb_suggestions', 'amb_access_requests'];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { table: tableName, id } = await req.json().catch(() => ({}));
  if (!TABLES.includes(tableName) || typeof id !== 'string') return new Response('Bad request', { status: 400 });

  // Réserve la ligne : une seule notification par ligne, même si la fonction est appelée plusieurs fois.
  const { data: row } = await sb.from(tableName).update({ notified_at: new Date().toISOString() })
    .eq('id', id).is('notified_at', null).select().maybeSingle();
  if (!row) return new Response('Déjà notifié ou introuvable', { status: 200 });

  try {
    const { subject, html } = await compose(tableName, row);
    await sendViaOdoo(subject, html);
    return new Response('ok');
  } catch (e) {
    console.error(e);
    // Libère la ligne pour pouvoir réessayer plus tard.
    await sb.from(tableName).update({ notified_at: null }).eq('id', id);
    return new Response(String(e), { status: 500 });
  }
});
