-- Module Ambassadeurs, étape 5 : l'équipe ajoute, modifie et supprime les immeubles depuis la carte.
-- Personne d'autre ne peut écrire dans ces tables. Peut être relancé sans risque.

drop policy if exists "équipe gère les immeubles" on public.amb_leads;
create policy "équipe gère les immeubles" on public.amb_leads
  for all using (public.amb_role() = 'admin') with check (public.amb_role() = 'admin');

drop policy if exists "équipe gère le statut" on public.amb_lead_status;
create policy "équipe gère le statut" on public.amb_lead_status
  for all using (public.amb_role() = 'admin') with check (public.amb_role() = 'admin');

grant insert, update, delete on public.amb_leads, public.amb_lead_status to authenticated;
