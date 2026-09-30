-- Réunion Trinergy (30/09/2026) :
--  1. Données énergie (consommation, injection, formules de prix, fournisseur) et dernière facture,
--     sur les contacts proposés et les lieux proposés ; nouveau chemin « J'ai des données sur ce bâtiment ».
--  2. Factures dans un espace privé (équipe seulement), supprimées automatiquement après 10 jours.
--  3. Critères de ciblage (« Qui cibler ? ») modifiables par l'équipe sans redéploiement.
--  4. Lieux proposés : type de bâtiment, région, installation PV, priorité A/B/C donnée par l'équipe.
--  5. Organisation des membres (ex. Trinergy).

-- 1. Données énergie ------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['amb_contributions', 'amb_suggestions'] loop
    execute format($f$
      alter table public.%1$I
        add column if not exists consumption_mwh     numeric check (consumption_mwh >= 0),
        add column if not exists injection_mwh       numeric check (injection_mwh >= 0),
        add column if not exists supplier            text,
        add column if not exists offtake_formula     text check (offtake_formula in ('Fixe', 'Variable', 'Indexé')),
        add column if not exists offtake_bihoraire   boolean not null default false,
        add column if not exists offtake_detail      text,
        add column if not exists injection_formula   text check (injection_formula in ('Fixe', 'Variable', 'Indexé')),
        add column if not exists injection_detail    text,
        add column if not exists invoice_path        text,
        add column if not exists invoice_uploaded_at timestamptz
    $f$, t);
  end loop;
end $$;

-- Nouveau chemin « data » : pas de contact obligatoire.
alter table public.amb_contributions drop constraint if exists amb_contributions_mode_check;
alter table public.amb_contributions add constraint amb_contributions_mode_check
  check (mode in ('intro', 'contact', 'data'));
alter table public.amb_contributions alter column contact_name drop not null;
alter table public.amb_contributions drop constraint if exists amb_contributions_contact_name_check;
alter table public.amb_contributions add constraint amb_contributions_contact_name_check
  check (mode = 'data' or length(trim(coalesce(contact_name, ''))) > 0);
alter table public.amb_contributions drop constraint if exists contact_needs_coordinates;
alter table public.amb_contributions add constraint contact_needs_coordinates check (
  mode in ('intro', 'data') or coalesce(contact_email, '') <> '' or coalesce(contact_phone, '') <> ''
);

-- Lieux proposés : critères et priorité.
alter table public.amb_suggestions
  add column if not exists building_type text check (building_type in ('Professionnel', 'Copropriété', 'Logement social', 'Bâtiment public', 'Autre')),
  add column if not exists region        text check (region in ('Bruxelles', 'Wallonie', 'Flandre')),
  add column if not exists has_pv        text check (has_pv in ('Oui', 'Non', 'Je ne sais pas')),
  add column if not exists pv_kwp        numeric check (pv_kwp >= 0),
  add column if not exists priority      text check (priority in ('A', 'B', 'C'));
grant update (follow_up, team_notes, priority) on public.amb_suggestions to authenticated;

-- Une facture ne peut être rattachée que depuis le dossier de son auteur ; horodatage serveur.
create or replace function public.amb_set_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_id := auth.uid();
  new.author_name := (select name from public.amb_members where user_id = auth.uid());
  new.follow_up := 'Nouveau';
  new.team_notes := null;
  if new.invoice_path is not null and split_part(new.invoice_path, '/', 1) <> auth.uid()::text then
    new.invoice_path := null;
  end if;
  new.invoice_uploaded_at := case when new.invoice_path is not null then now() end;
  return new;
end $$;

create or replace function public.amb_set_suggestion_author()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.author_id := auth.uid();
  new.author_name := (select name from public.amb_members where user_id = auth.uid());
  new.follow_up := 'Nouveau';
  new.team_notes := null;
  new.priority := null;
  if new.invoice_path is not null and split_part(new.invoice_path, '/', 1) <> auth.uid()::text then
    new.invoice_path := null;
  end if;
  new.invoice_uploaded_at := case when new.invoice_path is not null then now() end;
  return new;
end $$;

-- 2. Factures : espace privé, 10 Mo, PDF ou photo -----------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('amb-invoices', 'amb-invoices', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Dépôt : tout membre, uniquement dans son propre dossier ({user_id}/…). Pas de relecture.
drop policy if exists "amb factures : dépôt par un membre" on storage.objects;
create policy "amb factures : dépôt par un membre" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'amb-invoices' and public.amb_role() is not null
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Lecture et suppression : équipe RaYSun uniquement.
drop policy if exists "amb factures : lecture équipe" on storage.objects;
create policy "amb factures : lecture équipe" on storage.objects
  for select to authenticated
  using (bucket_id = 'amb-invoices' and public.amb_role() = 'admin');

drop policy if exists "amb factures : suppression équipe" on storage.objects;
create policy "amb factures : suppression équipe" on storage.objects
  for delete to authenticated
  using (bucket_id = 'amb-invoices' and public.amb_role() = 'admin');

-- Factures de plus de 10 jours (lu par la fonction amb-purge-invoices, clé service uniquement).
create or replace function public.amb_expired_invoices()
returns setof text language sql stable security definer set search_path = public, storage as $$
  select name from storage.objects
  where bucket_id = 'amb-invoices' and created_at < now() - interval '10 days'
$$;
revoke execute on function public.amb_expired_invoices() from anon, authenticated, public;
grant execute on function public.amb_expired_invoices() to service_role;

-- Suppression quotidienne à 3 h (heure de Bruxelles ≈ 1 h UTC).
create extension if not exists pg_cron;
select cron.unschedule('amb-purge-invoices') where exists (select 1 from cron.job where jobname = 'amb-purge-invoices');
select cron.schedule('amb-purge-invoices', '7 1 * * *', $$
  select net.http_post(
    url := 'https://wrexwthjavagzumuzlxx.supabase.co/functions/v1/amb-purge-invoices',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  )
$$);

-- 3. Réglages modifiables par l'équipe (critères de ciblage) ---------------------------------

create table if not exists public.amb_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.amb_settings enable row level security;
revoke all on public.amb_settings from anon;

drop policy if exists "membres lisent les réglages" on public.amb_settings;
create policy "membres lisent les réglages" on public.amb_settings
  for select using (public.amb_role() is not null);

drop policy if exists "équipe modifie les réglages" on public.amb_settings;
create policy "équipe modifie les réglages" on public.amb_settings
  for all using (public.amb_role() = 'admin') with check (public.amb_role() = 'admin');

insert into public.amb_settings (key, value) values ('target', $t$Priorité actuelle : Bruxelles.
Nous cherchons surtout des bâtiments qui PRODUISENT et CONSOMMENT de l’électricité (panneaux solaires + consommation sur place) : la communauté manque de production.

Acceptés :
• Professionnels : entreprises, commerces, entrepôts, écoles, hôpitaux, bâtiments publics
• Résidentiel uniquement en copropriété ou en logement social (Bruxelles et Wallonie)

Pas acceptés : maisons individuelles.

Priorités sur la carte : A = à approcher en premier, B = ensuite, C = plus tard.$t$)
on conflict (key) do nothing;

-- 4. Organisation des membres ---------------------------------------------------------------

alter table public.amb_members add column if not exists organisation text;
alter table public.amb_invites add column if not exists organisation text;

create or replace function public.amb_accept_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.amb_invites;
begin
  select * into inv from public.amb_invites where email = lower(new.email);
  if found then
    insert into public.amb_members (user_id, role, name, organisation) values (new.id, inv.role, inv.name, inv.organisation)
    on conflict (user_id) do update set role = excluded.role, name = excluded.name,
      organisation = coalesce(excluded.organisation, amb_members.organisation);
    delete from public.amb_invites where email = inv.email;
  end if;
  return new;
end $$;

drop function if exists public.amb_list_members();
create or replace function public.amb_list_members()
returns table (email text, role text, name text, pending boolean, organisation text)
language sql stable security definer set search_path = public as $$
  select * from (
    select u.email::text, m.role, m.name, false, m.organisation
    from public.amb_members m join auth.users u on u.id = m.user_id
    union all
    select i.email, i.role, i.name, true, i.organisation from public.amb_invites i
  ) t
  where public.amb_role() = 'admin'
  order by 4 desc, 2, 3
$$;
revoke execute on function public.amb_list_members() from anon, public;
grant execute on function public.amb_list_members() to authenticated;

create or replace function public.amb_set_member_org(p_email text, p_org text)
returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); o text := nullif(trim(p_org), '');
begin
  if public.amb_role() is distinct from 'admin' then
    raise exception 'Réservé à l’équipe';
  end if;
  update public.amb_members set organisation = o
  where user_id = (select id from auth.users where lower(email) = e);
  update public.amb_invites set organisation = o where email = e;
end $$;
revoke execute on function public.amb_set_member_org(text, text) from anon, public;
grant execute on function public.amb_set_member_org(text, text) to authenticated;
