-- Module Ambassadeurs, étape 7 : retirer l'accès d'une personne (membre ou invitation en attente).
-- Le compte et ce qu'elle a déjà proposé (contacts, lieux) sont conservés dans l'historique ;
-- elle ne voit simplement plus rien. Réservé à l'équipe ; on ne peut pas se retirer soi-même.
create or replace function public.amb_remove_member(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; e text := lower(trim(p_email));
begin
  if public.amb_role() is distinct from 'admin' then
    raise exception 'Réservé à l’équipe';
  end if;
  select id into uid from auth.users where lower(email) = e;
  if uid = auth.uid() then
    raise exception 'Vous ne pouvez pas retirer votre propre accès';
  end if;
  delete from public.amb_invites where email = e;
  if uid is not null then
    delete from public.amb_members where user_id = uid;
    -- Sa demande d'accès éventuelle est effacée : il pourra en refaire une, que l'équipe validera ou non.
    delete from public.amb_access_requests where user_id = uid;
  end if;
end $$;

revoke execute on function public.amb_remove_member(text) from anon, public;
grant execute on function public.amb_remove_member(text) to authenticated;
