// Crée (ou met à jour) un compte avec mot de passe, pour que l'équipe transmette elle-même
// les identifiants à un actionnaire ou un ambassadeur, sans passer par un email de connexion.
// Réservé à l'équipe : la fonction vérifie le rôle de l'appelant avec son propre jeton de session.
// Option send_email : envoie les accès à la personne via Brevo (secret BREVO_API_KEY, clé API v3).
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ROLES = ['shareholder', 'ambassador', 'admin'];
const SITE = 'https://citywatt-ambassadeurs.netlify.app/';
const SENDER = { name: 'Eric Rwamucyo — CityWatt', email: 'eric.rw@raysun.solar' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Email aux couleurs CityWatt (même mise en page que les emails de connexion Supabase).
function credentialsHtml(name: string, email: string, password: string, existing: boolean) {
  const row = (k: string, v: string) =>
    `<tr><td style="padding:6px 0;color:#6b7378;width:120px;">${k}</td><td style="padding:6px 0;font-weight:bold;font-family:Menlo,Consolas,monospace;">${esc(v)}</td></tr>`;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f5f2;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f2;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1d2327;">
<tr><td style="background:#0b7a5c;padding:22px 32px;"><span style="font-size:22px;font-weight:bold;color:#ffffff;">CityWatt</span><span style="font-size:22px;color:#b8e6d6;"> Ambassadeurs</span></td></tr>
<tr><td style="padding:32px 32px 8px 32px;font-size:16px;line-height:1.55;">
<p style="margin:0 0 16px 0;font-size:20px;font-weight:bold;">${existing ? 'Votre nouveau mot de passe' : 'Votre accès à la carte CityWatt'}</p>
<p style="margin:0;">Bonjour ${esc(name)},</p>
<p style="margin:12px 0 0 0;">${existing
    ? 'Voici votre nouveau mot de passe pour l’espace ambassadeurs CityWatt. L’ancien ne fonctionne plus.'
    : 'Votre accès à l’espace ambassadeurs CityWatt est prêt : la carte des bâtiments que nous cherchons à faire entrer dans la communauté d’énergie. Vous pouvez y proposer une introduction, un contact, des données de consommation ou un nouveau lieu.'}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0;background:#e5f4ef;border-radius:8px;padding:10px 16px;width:100%;">
${row('Adresse', SITE)}${row('Email', email)}${row('Mot de passe', password)}</table>
</td></tr>
<tr><td align="center" style="padding:20px 32px 24px 32px;"><a href="${SITE}" style="display:inline-block;background:#0b7a5c;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 32px;border-radius:8px;">Ouvrir la carte CityWatt</a></td></tr>
<tr><td style="padding:0 32px 28px 32px;font-size:14px;line-height:1.5;color:#6b7378;">
<p style="margin:0 0 12px 0;">Ces identifiants sont personnels : ne les transférez pas. Mot de passe oublié ? Écrivez-nous, nous vous en créons un nouveau.</p>
<p style="margin:0;">Pensez à ajouter eric.rw@raysun.solar à vos contacts pour que nos messages n’arrivent pas dans les spams.</p>
</td></tr>
<tr><td style="background:#e5f4ef;padding:18px 32px;font-size:13px;line-height:1.5;color:#3d4a45;"><strong>CityWatt</strong> — l’énergie solaire produite à Bruxelles, partagée entre voisins.<br>Une question ? Eric Rwamucyo · <a href="mailto:eric.rw@raysun.solar" style="color:#0b7a5c;">eric.rw@raysun.solar</a> · +32 484 07 28 29</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendCredentials(name: string, email: string, password: string, existing: boolean) {
  const key = Deno.env.get('BREVO_API_KEY');
  if (!key) return 'Secret BREVO_API_KEY manquant dans Supabase';
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: SENDER, to: [{ email, name }], replyTo: SENDER,
      subject: existing ? 'CityWatt — votre nouveau mot de passe' : 'CityWatt — votre accès à la carte des bâtiments',
      htmlContent: credentialsHtml(name, email, password, existing),
    }),
  }).catch((e) => ({ ok: false, text: async () => String(e) }) as Response);
  if (!res.ok) return `Brevo : ${await res.text()}`;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Méthode non autorisée' });

  // 1. L'appelant doit être connecté et avoir le rôle équipe.
  const caller = createClient(URL, ANON, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: role, error: roleError } = await caller.rpc('amb_role');
  if (roleError || role !== 'admin') return reply(403, { error: 'Réservé à l’équipe' });

  // 2. Données du compte.
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const password = String(body.password ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: 'Email invalide' });
  if (!name) return reply(400, { error: 'Nom manquant' });
  if (!ROLES.includes(body.role)) return reply(400, { error: 'Rôle invalide' });
  if (password.length < 8) return reply(400, { error: 'Mot de passe trop court (8 caractères minimum)' });

  // 3. Crée le compte, ou change le mot de passe s'il existe déjà.
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data?.user) {
    userId = created.data.user.id;
  } else {
    const { data: existing } = await admin.rpc('amb_user_id_by_email', { p_email: email });
    if (!existing) return reply(500, { error: created.error?.message ?? 'Création impossible' });
    userId = existing as string;
    const updated = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (updated.error) return reply(500, { error: updated.error.message });
  }

  // 4. Donne l'accès avec le rôle choisi (et l'organisation si elle est indiquée).
  const member: Record<string, unknown> = { user_id: userId, role: body.role, name };
  const organisation = String(body.organisation ?? '').trim();
  if (organisation) member.organisation = organisation;
  const { error: memberError } = await admin.from('amb_members').upsert(member, { onConflict: 'user_id' });
  if (memberError) return reply(500, { error: memberError.message });
  await admin.from('amb_invites').delete().eq('email', email);

  // 5. Envoi des accès par email (Brevo), si demandé. Un échec n'annule pas la création du compte.
  const existing = !created.data?.user;
  const emailError = body.send_email ? await sendCredentials(name, email, password, existing) : null;
  if (emailError) console.error(emailError);

  return reply(200, { ok: true, email, existing, emailed: !!body.send_email && !emailError, email_error: emailError });
});
