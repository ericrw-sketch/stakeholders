-- Module Ambassadeurs, étape 6 : utilisé par la fonction amb-admin-user (création de comptes avec mot de passe).
-- Retrouve l'id d'un compte à partir de son email. Réservé au rôle serveur (service_role).
create or replace function public.amb_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;

revoke execute on function public.amb_user_id_by_email(text) from anon, authenticated, public;
grant execute on function public.amb_user_id_by_email(text) to service_role;
