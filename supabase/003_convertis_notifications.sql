-- Module Ambassadeurs, étape 3 : points convertis et notifications par email (via Odoo).
-- À exécuter après 002. Peut être relancé sans risque.

-- 1. Immeubles convertis : retirés de la carte pour tout le monde, sauf l'équipe ---------

alter table public.amb_leads add column if not exists converted_at timestamptz;

drop policy if exists "membres lisent les immeubles" on public.amb_leads;
create policy "membres lisent les immeubles" on public.amb_leads
  for select using (
    public.amb_role() = 'admin' or (public.amb_role() is not null and converted_at is null)
  );

create or replace function public.amb_set_lead_converted(p_id text, p_converted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.amb_role() is distinct from 'admin' then
    raise exception 'Réservé à l’équipe';
  end if;
  update public.amb_leads
  set converted_at = case when p_converted then now() end, updated_at = now()
  where id = p_id;
end $$;

revoke execute on function public.amb_set_lead_converted(text, boolean) from anon, public;
grant execute on function public.amb_set_lead_converted(text, boolean) to authenticated;

-- 2. Lieux proposés convertis : nouveau statut de suivi ---------------------------------

alter table public.amb_suggestions drop constraint if exists amb_suggestions_follow_up_check;
alter table public.amb_suggestions add constraint amb_suggestions_follow_up_check
  check (follow_up in ('Nouveau', 'À étudier', 'Retenu', 'Converti', 'Écarté'));

-- 3. Notifications -----------------------------------------------------------------------
-- À chaque contact proposé, lieu proposé ou demande d'accès (hors équipe), la base appelle
-- la fonction amb-notify, qui envoie un email via Odoo. Elle ne reçoit que la table et l'id,
-- relit la ligne elle-même et ne notifie qu'une fois (colonne notified_at).

create extension if not exists pg_net;

alter table public.amb_contributions   add column if not exists notified_at timestamptz;
alter table public.amb_suggestions     add column if not exists notified_at timestamptz;
alter table public.amb_access_requests add column if not exists notified_at timestamptz;

create or replace function public.amb_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.amb_role(), '') = 'admin' then
    return new; -- pas de notification pour ce que l'équipe saisit elle-même
  end if;
  perform net.http_post(
    url := 'https://wrexwthjavagzumuzlxx.supabase.co/functions/v1/amb-notify',
    body := jsonb_build_object('table', tg_table_name, 'id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end $$;

revoke execute on function public.amb_notify() from anon, authenticated, public;

drop trigger if exists amb_notify on public.amb_contributions;
create trigger amb_notify after insert on public.amb_contributions
  for each row execute function public.amb_notify();

drop trigger if exists amb_notify on public.amb_suggestions;
create trigger amb_notify after insert on public.amb_suggestions
  for each row execute function public.amb_notify();

drop trigger if exists amb_notify on public.amb_access_requests;
create trigger amb_notify after insert on public.amb_access_requests
  for each row execute function public.amb_notify();
