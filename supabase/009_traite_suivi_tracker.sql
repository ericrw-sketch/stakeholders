-- Statut « Traité » et comptage automatique dans le tableau de suivi commercial.
--  1. « Traité » s'ajoute aux statuts de suivi (contacts proposés et lieux proposés) ; l'équipe ne les voit
--     plus dans les tableaux ni sur la carte.
--  2. Chaque élément passé à « Traité » cette semaine compte comme un email direct pour la personne de
--     l'équipe qui l'a traité : le total est écrit dans kv_store sous « st:citywatt », lu par le suivi
--     commercial (ligne « Emails en direct », affichée « dont X auto »).

-- 1. Statut « Traité » et horodatage ------------------------------------------------------

alter table public.amb_contributions drop constraint if exists amb_contributions_follow_up_check;
alter table public.amb_contributions add constraint amb_contributions_follow_up_check
  check (follow_up in ('Nouveau', 'En cours', 'Rendez-vous obtenu', 'Sans suite', 'Traité'));
alter table public.amb_suggestions drop constraint if exists amb_suggestions_follow_up_check;
alter table public.amb_suggestions add constraint amb_suggestions_follow_up_check
  check (follow_up in ('Nouveau', 'À étudier', 'Retenu', 'Converti', 'Écarté', 'Traité'));

alter table public.amb_contributions
  add column if not exists treated_at timestamptz,
  add column if not exists treated_by uuid;
alter table public.amb_suggestions
  add column if not exists treated_at timestamptz,
  add column if not exists treated_by uuid;

-- Date et auteur du traitement posés par le serveur ; effacés si l'élément sort de « Traité ».
create or replace function public.amb_set_treated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.follow_up = 'Traité' and old.follow_up is distinct from 'Traité' then
    new.treated_at := now();
    new.treated_by := auth.uid();
  elsif new.follow_up is distinct from 'Traité' then
    new.treated_at := null;
    new.treated_by := null;
  else
    new.treated_at := old.treated_at;
    new.treated_by := old.treated_by;
  end if;
  return new;
end $$;

create or replace trigger amb_contributions_treated before update on public.amb_contributions
  for each row execute function public.amb_set_treated();
create or replace trigger amb_suggestions_treated before update on public.amb_suggestions
  for each row execute function public.amb_set_treated();

-- 2. Comptage pour le suivi commercial ----------------------------------------------------

-- Qui est qui dans le suivi (r1 = Eric). Table fermée : aucune politique, lue seulement par la fonction.
create table if not exists public.amb_tracker_reps (
  email  text primary key,
  rep_id text not null
);
alter table public.amb_tracker_reps enable row level security;
revoke all on public.amb_tracker_reps from anon, authenticated;
insert into public.amb_tracker_reps (email, rep_id) values ('eric.rw@raysun.solar', 'r1')
on conflict (email) do update set rep_id = excluded.rep_id;

-- Recalcule les éléments traités depuis lundi (heure de Bruxelles, comme le suivi) et écrit « st:citywatt ».
create or replace function public.amb_tracker_sync()
returns void language plpgsql security definer set search_path = public as $$
declare
  week_start date := date_trunc('week', now() at time zone 'Europe/Brussels')::date;
  since timestamptz := week_start::timestamp at time zone 'Europe/Brussels';
  by_rep jsonb;
begin
  select coalesce(jsonb_object_agg(rep_id, jsonb_build_object('direct', n)), '{}'::jsonb) into by_rep
  from (
    select r.rep_id, count(*) as n
    from (
      select treated_by from public.amb_contributions where follow_up = 'Traité' and treated_at >= since
      union all
      select treated_by from public.amb_suggestions where follow_up = 'Traité' and treated_at >= since
    ) t
    join auth.users u on u.id = t.treated_by
    join public.amb_tracker_reps r on r.email = lower(u.email)
    group by r.rep_id
  ) c;

  insert into public.kv_store (key, value, updated_at)
  values ('st:citywatt', jsonb_build_object(
            'byRep', by_rep, 'weekStart', to_char(week_start, 'YYYY-MM-DD'),
            'updatedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
end $$;
revoke execute on function public.amb_tracker_sync() from anon, authenticated, public;

create or replace function public.amb_tracker_sync_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.amb_tracker_sync();
  return null;
end $$;

create or replace trigger amb_contributions_tracker
  after update of follow_up or delete on public.amb_contributions
  for each statement execute function public.amb_tracker_sync_trigger();
create or replace trigger amb_suggestions_tracker
  after update of follow_up or delete on public.amb_suggestions
  for each statement execute function public.amb_tracker_sync_trigger();

-- Remise à zéro en début de semaine (et filet de sécurité) : toutes les heures.
select cron.schedule('amb-tracker-sync', '4 * * * *', 'select public.amb_tracker_sync()');

select public.amb_tracker_sync();
