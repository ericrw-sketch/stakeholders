# CityWatt — Espace ambassadeurs

Carte des immeubles bruxellois ciblés par CityWatt. Les actionnaires (puis les ambassadeurs) cliquent sur un immeuble, lisent la fiche issue de l'Excel, et choisissent l'un des deux chemins :

- **Je fais l'introduction** : ils nous mettent en relation eux-mêmes ;
- **Je vous donne le contact** : ils transmettent les coordonnées et nous approchons la personne.

L'équipe suit les propositions sur `admin.html`, gère qui a accès, et exporte en CSV (s'ouvre dans Excel) au format de l'onglet « Vos contacts ».

**Architecture** : site statique sur **Netlify** (`site/`) + base de données et comptes dans **Supabase** (projet « Suivi-vendeurs »). Pas de serveur à maintenir. Les tables du module sont préfixées `amb_` et ne touchent pas aux tables existantes de l'app.

## Mise en place (une seule fois)

### 1. Supabase

Dans le projet **Suivi-vendeurs** → **SQL Editor** → New query :

1. Collez et exécutez `supabase/ambassadeurs.sql` (crée les tables et les règles d'accès).
2. Collez et exécutez `supabase/immeubles.sql` (charge les 16 immeubles).
3. Donnez-vous le rôle équipe (remplacez l'email par celui de votre compte Supabase) :

   ```sql
   insert into amb_members (user_id, role, name)
   select id, 'admin', 'Eric' from auth.users where email = 'eric.rw@raysun.solar';
   ```

Puis dans **Project Settings → API**, copiez « Project URL » et la clé « anon public » dans `site/config.js`.

### 2. Netlify

- **Add new site → Import from Git** → ce dépôt. Netlify lit `netlify.toml` : rien à régler (dossier publié : `site`, pas de build).
- Ou, sans GitHub : glissez le dossier `site/` sur https://app.netlify.com/drop.

### 3. Liens de connexion par email

Supabase → **Authentication → URL Configuration** → ajoutez l'adresse Netlify (ex. `https://citywatt-ambassadeurs.netlify.app`) dans **Redirect URLs**. Sans ça, le lien reçu par email renvoie vers la mauvaise adresse.

## Donner accès à quelqu'un

1. Supabase → **Authentication → Users → Invite user** (la personne reçoit un email pour créer son mot de passe). Si elle a déjà un compte dans votre app, sautez cette étape.
2. Sur `admin.html`, section « Qui a accès » : email, nom affiché, rôle.

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

- **Lien ou iframe** (le plus rapide) : un onglet qui ouvre ou affiche l'adresse Netlify. Même projet Supabase, donc mêmes comptes. Pour l'iframe, ajoutez le domaine de l'app dans `frame-ancestors` de `netlify.toml`.
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
