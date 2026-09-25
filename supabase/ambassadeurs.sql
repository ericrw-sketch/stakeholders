-- Module « Ambassadeurs » CityWatt — à exécuter une fois dans Supabase (SQL Editor).
-- Toutes les tables sont préfixées amb_ pour ne pas toucher aux tables existantes de l'app.
-- Le script peut être relancé sans risque.

-- 1. Membres : qui a accès, et avec quel rôle ---------------------------------

create table if not exists public.amb_members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('shareholder', 'ambassador', 'admin')),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Rôle de l'utilisateur connecté (null s'il n'est pas membre).
-- security definer : lit amb_members sans repasser par ses propres règles RLS.
create or replace function public.amb_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.amb_members where user_id = auth.uid()
$$;

-- 2. Immeubles ----------------------------------------------------------------

create table if not exists public.amb_leads (
  id               text primary key,
  wave             int  not null,
  priority         text not null check (priority in ('A', 'B', 'C')),
  name             text not null,
  address          text,
  municipality     text,
  solar_kwp        text,
  production_mwh   numeric,
  companies        text,
  consumption_mwh  numeric,
  target_role      text,
  owner            text,
  pitch            text,
  target_function  text,
  lat              double precision,
  lng              double precision,
  updated_at       timestamptz not null default now()
);

-- « Où nous en sommes » est dans une table séparée pour pouvoir la cacher aux ambassadeurs.
create table if not exists public.amb_lead_status (
  lead_id text primary key references public.amb_leads (id) on delete cascade,
  status  text
);

-- 3. Contacts proposés ----------------------------------------------------------

create table if not exists public.amb_contributions (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  lead_id          text not null references public.amb_leads (id) on delete cascade,
  mode             text not null check (mode in ('intro', 'contact')),
  contact_name     text not null check (length(trim(contact_name)) > 0),
  contact_function text,
  contact_company  text,
  contact_email    text,
  contact_phone    text,
  relation         text,
  strength         text check (strength in ('Fort', 'Moyen', 'Faible')),
  mention_name     boolean not null default true,
  when_text        text,
  remarks          text,
  author_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name      text,
  follow_up        text not null default 'Nouveau'
                   check (follow_up in ('Nouveau', 'En cours', 'Rendez-vous obtenu', 'Sans suite')),
  team_notes       text,
  constraint contact_needs_coordinates check (
    mode = 'intro' or coalesce(contact_email, '') <> '' or coalesce(contact_phone, '') <> ''
  )
);

create index if not exists amb_contributions_lead_idx on public.amb_contributions (lead_id);
create index if not exists amb_contributions_author_idx on public.amb_contributions (author_id);

-- Le nom de l'auteur est toujours celui de sa fiche membre, pas ce que le navigateur envoie.
create or replace function public.amb_set_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_id := auth.uid();
  new.author_name := (select name from public.amb_members where user_id = auth.uid());
  new.follow_up := 'Nouveau';
  new.team_notes := null;
  return new;
end $$;

drop trigger if exists amb_set_author on public.amb_contributions;
create trigger amb_set_author before insert on public.amb_contributions
  for each row execute function public.amb_set_author();

-- 4. Règles d'accès (RLS) -------------------------------------------------------

alter table public.amb_members       enable row level security;
alter table public.amb_leads         enable row level security;
alter table public.amb_lead_status   enable row level security;
alter table public.amb_contributions enable row level security;

drop policy if exists "membre lit sa fiche, admin lit tout" on public.amb_members;
create policy "membre lit sa fiche, admin lit tout" on public.amb_members
  for select using (user_id = auth.uid() or public.amb_role() = 'admin');

drop policy if exists "membres lisent les immeubles" on public.amb_leads;
create policy "membres lisent les immeubles" on public.amb_leads
  for select using (public.amb_role() is not null);

drop policy if exists "actionnaires et équipe lisent le statut" on public.amb_lead_status;
create policy "actionnaires et équipe lisent le statut" on public.amb_lead_status
  for select using (public.amb_role() in ('shareholder', 'admin'));

drop policy if exists "membre lit ses contacts, admin lit tout" on public.amb_contributions;
create policy "membre lit ses contacts, admin lit tout" on public.amb_contributions
  for select using (author_id = auth.uid() or public.amb_role() = 'admin');

drop policy if exists "membre propose un contact" on public.amb_contributions;
create policy "membre propose un contact" on public.amb_contributions
  for insert with check (public.amb_role() is not null);

drop policy if exists "équipe met à jour le suivi" on public.amb_contributions;
create policy "équipe met à jour le suivi" on public.amb_contributions
  for update using (public.amb_role() = 'admin') with check (public.amb_role() = 'admin');

-- Les membres ne peuvent modifier que le suivi et les notes (et seulement s'ils sont admin).
revoke update on public.amb_contributions from authenticated;
grant update (follow_up, team_notes) on public.amb_contributions to authenticated;
revoke all on public.amb_contributions, public.amb_leads, public.amb_lead_status, public.amb_members from anon;

-- 5. Fonctions utilitaires -------------------------------------------------------

-- Nombre de contacts déjà proposés par immeuble, sans révéler qui les a proposés.
create or replace function public.amb_lead_counts()
returns table (lead_id text, n bigint)
language sql stable security definer set search_path = public as $$
  select lead_id, count(*) from public.amb_contributions
  where public.amb_role() is not null
  group by lead_id
$$;

-- Invitations : un email + un rôle, avant même que la personne ait un compte.
-- Quand elle se connecte pour la première fois (lien reçu par email), elle devient membre automatiquement.
create table if not exists public.amb_invites (
  email      text primary key check (email = lower(trim(email))),
  role       text not null check (role in ('shareholder', 'ambassador', 'admin')),
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.amb_invites enable row level security;
revoke all on public.amb_invites from anon, authenticated;

create or replace function public.amb_accept_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.amb_invites;
begin
  select * into inv from public.amb_invites where email = lower(new.email);
  if found then
    insert into public.amb_members (user_id, role, name) values (new.id, inv.role, inv.name)
    on conflict (user_id) do update set role = excluded.role, name = excluded.name;
    delete from public.amb_invites where email = inv.email;
  end if;
  return new;
end $$;

drop trigger if exists amb_accept_invite on auth.users;
create trigger amb_accept_invite after insert on auth.users
  for each row execute function public.amb_accept_invite();

-- Ajouter (ou modifier) un membre à partir de son email. Réservé à l'équipe.
-- Si la personne a déjà un compte, elle est membre tout de suite ; sinon elle est invitée.
create or replace function public.amb_upsert_member(p_email text, p_role text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; e text := lower(trim(p_email));
begin
  if public.amb_role() is distinct from 'admin' then
    raise exception 'Réservé à l’équipe';
  end if;
  select id into uid from auth.users where lower(email) = e;
  if uid is null then
    insert into public.amb_invites (email, role, name) values (e, p_role, p_name)
    on conflict (email) do update set role = excluded.role, name = excluded.name;
  else
    insert into public.amb_members (user_id, role, name) values (uid, p_role, p_name)
    on conflict (user_id) do update set role = excluded.role, name = excluded.name;
  end if;
end $$;

-- Liste des membres et des invitations en attente. Réservé à l'équipe.
drop function if exists public.amb_list_members();
create or replace function public.amb_list_members()
returns table (email text, role text, name text, pending boolean)
language sql stable security definer set search_path = public as $$
  select * from (
    select u.email::text, m.role, m.name, false
    from public.amb_members m join auth.users u on u.id = m.user_id
    union all
    select i.email, i.role, i.name, true from public.amb_invites i
  ) t
  where public.amb_role() = 'admin'
  order by 4 desc, 2, 3
$$;

revoke execute on function public.amb_upsert_member(text, text, text) from anon, public;
revoke execute on function public.amb_list_members() from anon, public;
revoke execute on function public.amb_lead_counts() from anon, public;
grant execute on function public.amb_upsert_member(text, text, text) to authenticated;
grant execute on function public.amb_list_members() to authenticated;
grant execute on function public.amb_lead_counts() to authenticated;
revoke execute on function public.amb_accept_invite() from anon, authenticated, public;
revoke execute on function public.amb_set_author() from anon, authenticated, public;
revoke execute on function public.amb_role() from anon, public;
grant execute on function public.amb_role() to authenticated;
