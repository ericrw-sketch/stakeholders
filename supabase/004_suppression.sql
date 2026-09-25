-- Module Ambassadeurs, étape 4 : l'équipe peut supprimer contacts, lieux proposés et demandes d'accès
-- (tests, doublons, erreurs). Personne d'autre ne peut supprimer. Peut être relancé sans risque.

drop policy if exists "équipe supprime les contacts" on public.amb_contributions;
create policy "équipe supprime les contacts" on public.amb_contributions
  for delete using (public.amb_role() = 'admin');

drop policy if exists "équipe supprime les lieux" on public.amb_suggestions;
create policy "équipe supprime les lieux" on public.amb_suggestions
  for delete using (public.amb_role() = 'admin');

drop policy if exists "équipe supprime les demandes" on public.amb_access_requests;
create policy "équipe supprime les demandes" on public.amb_access_requests
  for delete using (public.amb_role() = 'admin');

grant delete on public.amb_contributions, public.amb_suggestions, public.amb_access_requests to authenticated;
