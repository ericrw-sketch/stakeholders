# CityWatt — Espace ambassadeurs

Carte des immeubles bruxellois ciblés par CityWatt. Les actionnaires (puis les ambassadeurs) cliquent sur un immeuble, lisent la fiche issue de l'Excel, et choisissent l'un des deux chemins :

- **Je fais l'introduction** : ils nous mettent en relation eux-mêmes ;
- **Je vous donne le contact** : ils transmettent les coordonnées et nous approchons la personne.

L'équipe suit les propositions sur `admin.html`, gère qui a accès, et exporte en CSV (s'ouvre dans Excel) au format de l'onglet « Vos contacts ».

**Architecture** : site statique sur **Netlify** (`site/`) + base de données et comptes dans **Supabase** (projet « Suivi-vendeurs »). Pas de serveur à maintenir. Les tables du module sont préfixées `amb_` et ne touchent pas aux tables existantes de l'app.

## Mise en place

Déjà fait dans le projet Supabase **Suivi-vendeurs** : tables `amb_*`, règles d'accès, 16 immeubles, invitation de eric.rw@raysun.solar en rôle équipe. `site/config.js` est rempli. Le projet Netlify **citywatt-ambassadeurs** existe (https://citywatt-ambassadeurs.netlify.app).

Reste à faire à la main :

1. **Netlify → citywatt-ambassadeurs → Project configuration → Build & deploy → Link repository** : ce dépôt, branche `claude/leads-map-platform-rzhme7`. Chaque push déploie ensuite automatiquement (`netlify.toml` publie `site/`, sans build).
2. **Supabase → Authentication → URL Configuration** : *Site URL* = `https://citywatt-ambassadeurs.netlify.app`, et ajouter `https://citywatt-ambassadeurs.netlify.app/**` dans *Redirect URLs*.
3. **Supabase → Authentication → Emails → SMTP Settings** : brancher un service d'envoi (Resend, Brevo…). Sans ça, Supabase n'envoie les liens de connexion qu'aux membres de l'organisation Supabase, et au maximum quelques-uns par heure.

## Donner accès à quelqu'un

Sur `admin.html`, section « Qui a accès » : email, nom affiché, rôle. Envoyez ensuite l'adresse du site à la personne : elle clique sur « Recevoir un lien de connexion » avec cet email. Son compte est créé à ce moment-là et reçoit automatiquement le rôle prévu (table `amb_invites`).

| Rôle | Voit « Où nous en sommes » | Voit les contacts des autres | Suivi équipe |
|---|---|---|---|
| Actionnaire | Oui | Non (seulement le nombre par immeuble) | Non |
| Ambassadeur | **Non** | Non | Non |
| Équipe | Oui | Oui | Oui |

Ces règles sont appliquées par la base de données (RLS), pas seulement par l'écran : même quelqu'un qui bricole le navigateur ne peut pas les contourner. Un compte de votre app qui n'est pas dans `amb_members` ne voit rien.

## Mettre à jour les immeubles

1. Modifiez l'Excel (onglet « Immeubles », mêmes en-têtes) et remplacez `data/leads.xlsx`.
2. Nouvel immeuble ? Ajoutez ses coordonnées dans `data/coordinates.json` (clic droit sur Google Maps pour les obtenir).
3. `npm install` puis `npm run import` → régénère `supabase/immeubles.sql`.
4. Collez `supabase/immeubles.sql` dans le SQL Editor. Les contacts déjà proposés sont conservés.

Les coordonnées actuelles sont **approximatives** : à vérifier une fois, surtout Four à Briques, Toyota, Cora et Putman.

## Intégrer comme onglet dans l'app Suivi-vendeurs

Deux possibilités, selon le code de l'app :

- **Lien ou iframe** (le plus rapide) : un onglet qui ouvre ou affiche l'adresse Netlify. Même projet Supabase. Pour l'iframe, ajoutez le domaine de l'app dans `frame-ancestors` de `netlify.toml`.
- **Intégration native** : copier la carte et le formulaire dans le code de l'app, qui partage alors la session de connexion. Nécessite l'accès au code source de l'app.

## Structure

```
site/                     Ce que Netlify publie
  index.html, app.js      Carte, fiche, formulaire
  admin.html              Suivi équipe, accès, export CSV
  auth.js                 Connexion Supabase partagée
  config.js               URL et clé anon Supabase  ← à remplir
  vendor/                 Leaflet et supabase-js (copies locales)
supabase/
  ambassadeurs.sql        Tables, règles d'accès, fonctions
  immeubles.sql           Données des immeubles (généré)
scripts/import-excel.js   Excel → data/leads.json + supabase/immeubles.sql
data/                     Excel source et coordonnées
```
