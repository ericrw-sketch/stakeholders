// Connexion Supabase partagée par la carte (index.html) et le suivi équipe (admin.html).
const sb = supabase.createClient(window.CITYWATT_CONFIG.supabaseUrl, window.CITYWATT_CONFIG.supabaseAnonKey);

// Renvoie { user, member } — member est null si le compte n'a pas encore accès au module.
async function currentMember() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.from('amb_members').select('role, name').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  return { user: session.user, member: data };
}

async function signOut() {
  await sb.auth.signOut();
  location.reload();
}

// Branche le formulaire de connexion (#login-form) : mot de passe, ou lien magique par email.
function wireLoginForm(onSignedIn) {
  const form = document.getElementById('login-form');
  const err = document.getElementById('login-error');
  const info = document.getElementById('login-info');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const { email, password } = Object.fromEntries(new FormData(form).entries());
    if (!password) { err.textContent = 'Entrez votre mot de passe, ou demandez un lien de connexion.'; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { err.textContent = 'Email ou mot de passe incorrect.'; return; }
    onSignedIn();
  });

  document.getElementById('magic-link').addEventListener('click', async () => {
    err.textContent = '';
    const email = form.email.value.trim();
    if (!email) { err.textContent = 'Entrez d’abord votre email.'; return; }
    const { error } = await sb.auth.signInWithOtp({
      email,
      // Crée le compte à la première connexion ; seul un email invité par l'équipe obtient l'accès.
      options: { shouldCreateUser: true, emailRedirectTo: location.href.split('#')[0] },
    });
    if (error) { err.textContent = 'Impossible d’envoyer le lien pour le moment. Réessayez dans quelques minutes.'; return; }
    info.hidden = false;
    info.textContent = `Lien envoyé à ${email}. Ouvrez-le depuis cet appareil.`;
  });
}
