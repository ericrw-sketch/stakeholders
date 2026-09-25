-- Module Ambassadeurs, étape 2 : à exécuter après ambassadeurs.sql. Peut être relancé sans risque.
--   1. Demandes d'accès validées à la main par l'équipe
--   2. Lieux proposés par les ambassadeurs (bouton « + » sur la carte)
--   3. Membres des communautés d'énergie (synchronisés depuis Odoo dans zc_membres)

-- 1. Demandes d'accès ---------------------------------------------------------------
-- Toute personne peut créer un compte avec son email, mais n'a accès à rien tant que
-- l'équipe n'a pas validé sa demande (ou ne l'a pas invitée au préalable).

create table if not exists public.amb_access_requests (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  user_id        uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  email          text,
  name           text not null check (length(trim(name)) > 0),
  company        text,
  requested_role text not null default 'ambassador' check (requested_role in ('shareholder', 'ambassador')),
  message        text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at     timestamptz
);

create or replace function public.amb_set_request_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.email := (select email from auth.users where id = auth.uid());
  new.status := 'pending';
  new.decided_at := null;
  return new;
end $$;

drop trigger if exists amb_set_request_user on public.amb_access_requests;
create trigger amb_set_request_user before insert on public.amb_access_requests
  for each row execute function public.amb_set_request_user();

alter table public.amb_access_requests enable row level security;

drop policy if exists "demandeur lit sa demande, admin lit tout" on public.amb_access_requests;
create policy "demandeur lit sa demande, admin lit tout" on public.amb_access_requests
  for select using (user_id = auth.uid() or public.amb_role() = 'admin');

drop policy if exists "non-membre dépose une demande" on public.amb_access_requests;
create policy "non-membre dépose une demande" on public.amb_access_requests
  for insert with check (auth.uid() is not null and public.amb_role() is null);

revoke all on public.amb_access_requests from anon;
revoke update, delete on public.amb_access_requests from authenticated;

-- Accepter (avec un rôle) ou refuser une demande. Réservé à l'équipe.
create or replace function public.amb_decide_request(p_id uuid, p_approve boolean, p_role text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.amb_access_requests;
begin
  if public.amb_role() is distinct from 'admin' then
    raise exception 'Réservé à l’équipe';
  end if;
  select * into r from public.amb_access_requests where id = p_id;
  if not found then raise exception 'Demande introuvable'; end if;
  if p_approve then
    insert into public.amb_members (user_id, role, name)
    values (r.user_id, coalesce(p_role, r.requested_role), r.name)
    on conflict (user_id) do update set role = excluded.role, name = excluded.name;
  end if;
  update public.amb_access_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
  where id = p_id;
end $$;

-- 2. Lieux proposés par les ambassadeurs --------------------------------------------

create table if not exists public.amb_suggestions (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  author_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name      text,
  place_name       text not null check (length(trim(place_name)) > 0),
  address          text,
  lat              double precision not null,
  lng              double precision not null,
  reason           text,
  has_contact      boolean not null default false,
  contact_name     text,
  contact_function text,
  contact_email    text,
  contact_phone    text,
  relation         text,
  follow_up        text not null default 'Nouveau'
                   check (follow_up in ('Nouveau', 'À étudier', 'Retenu', 'Écarté')),
  team_notes       text,
  constraint contact_needs_name check (not has_contact or coalesce(trim(contact_name), '') <> '')
);

create or replace function public.amb_set_suggestion_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_id := auth.uid();
  new.author_name := (select name from public.amb_members where user_id = auth.uid());
  new.follow_up := 'Nouveau';
  new.team_notes := null;
  return new;
end $$;

drop trigger if exists amb_set_suggestion_author on public.amb_suggestions;
create trigger amb_set_suggestion_author before insert on public.amb_suggestions
  for each row execute function public.amb_set_suggestion_author();

alter table public.amb_suggestions enable row level security;

drop policy if exists "auteur lit ses lieux, admin lit tout" on public.amb_suggestions;
create policy "auteur lit ses lieux, admin lit tout" on public.amb_suggestions
  for select using (author_id = auth.uid() or public.amb_role() = 'admin');

drop policy if exists "membre propose un lieu" on public.amb_suggestions;
create policy "membre propose un lieu" on public.amb_suggestions
  for insert with check (public.amb_role() is not null);

drop policy if exists "équipe suit les lieux" on public.amb_suggestions;
create policy "équipe suit les lieux" on public.amb_suggestions
  for update using (public.amb_role() = 'admin') with check (public.amb_role() = 'admin');

revoke all on public.amb_suggestions from anon;
revoke update, delete on public.amb_suggestions from authenticated;
grant update (follow_up, team_notes) on public.amb_suggestions to authenticated;

-- 3. Membres des communautés d'énergie ------------------------------------------------
-- Lecture seule de zc_membres (clients rattachés à une opération, géolocalisés).
-- Les noms ne sont renvoyés qu'aux actionnaires et à l'équipe ; les ambassadeurs voient
-- seulement l'emplacement et la communauté.

create or replace function public.amb_community_members()
returns table (lat double precision, lng double precision, operation text, name text)
language sql stable security definer set search_path = public as $$
  select m.lat, m.lng,
         regexp_replace(split_part(m.operation_nom, ',', 1), '^\S+\s*-\s*', ''),
         case when public.amb_role() in ('shareholder', 'admin') then m.nom end
  from public.zc_membres m
  where public.amb_role() is not null
    and m.statut = 'client' and m.operation_nom is not null
    and m.lat is not null and m.lng is not null
$$;

-- Droits d'exécution ------------------------------------------------------------------

revoke execute on function public.amb_set_request_user() from anon, authenticated, public;
revoke execute on function public.amb_set_suggestion_author() from anon, authenticated, public;
revoke execute on function public.amb_decide_request(uuid, boolean, text) from anon, public;
revoke execute on function public.amb_community_members() from anon, public;
grant execute on function public.amb_decide_request(uuid, boolean, text) to authenticated;
grant execute on function public.amb_community_members() to authenticated;
