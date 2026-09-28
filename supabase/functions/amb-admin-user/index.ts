// Crée (ou met à jour) un compte avec mot de passe, pour que l'équipe transmette elle-même
// les identifiants à un actionnaire ou un ambassadeur, sans passer par un email de connexion.
// Réservé à l'équipe : la fonction vérifie le rôle de l'appelant avec son propre jeton de session.
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

  // 4. Donne l'accès avec le rôle choisi.
  const { error: memberError } = await admin.from('amb_members')
    .upsert({ user_id: userId, role: body.role, name }, { onConflict: 'user_id' });
  if (memberError) return reply(500, { error: memberError.message });
  await admin.from('amb_invites').delete().eq('email', email);

  return reply(200, { ok: true, email, existing: !created.data?.user });
});
