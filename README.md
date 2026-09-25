# CityWatt — Espace ambassadeurs

Carte des immeubles bruxellois ciblés par CityWatt. Les actionnaires (puis les ambassadeurs) cliquent sur un immeuble, lisent la fiche issue de l'Excel, et choisissent l'un des deux chemins :

- **Je fais l'introduction** : ils nous mettent en relation eux-mêmes ;
- **Je vous donne le contact** : ils transmettent les coordonnées et nous approchons la personne.

Ils peuvent aussi **proposer un nouveau lieu** à prospecter (bouton « + » sur la carte), avec ou sans contact sur place. La carte affiche en plus les **membres des communautés CityWatt** (synchronisés depuis Odoo dans `zc_membres` par l'app Suivi-vendeurs).

L'équipe, sur `admin.html` : valide les demandes d'accès, suit les contacts et les lieux proposés, invite des personnes, exporte en CSV (s'ouvre dans Excel).

**Architecture** : site statique sur **Netlify** (`site/`) + base de données et comptes dans **Supabase** (projet « Suivi-vendeurs »). Pas de serveur à maintenir. Les tables du module sont préfixées `amb_` et ne touchent pas aux tables existantes de l'app.

## Mise en place

Déjà fait dans le projet Supabase **Suivi-vendeurs** : tables `amb_*`, règles d'accès, 16 immeubles, invitation de eric.rw@raysun.solar en rôle équipe. `site/config.js` est rempli. Le projet Netlify **citywatt-ambassadeurs** existe (https://citywatt-ambassadeurs.netlify.app).

Reste à faire à la main :

1. **Netlify → citywatt-ambassadeurs → Project configuration → Build & deploy → Link repository** : ce dépôt, branche `claude/leads-map-platform-rzhme7`. Chaque push déploie ensuite automatiquement (`netlify.toml` publie `site/`, sans build).
2. **Supabase → Authentication → URL Configuration** : *Site URL* = `https://citywatt-ambassadeurs.netlify.app`, et ajouter `https://citywatt-ambassadeurs.netlify.app/**` dans *Redirect URLs*.
3. **Supabase → Authentication → Emails → SMTP Settings** : brancher un service d'envoi (Resend, Brevo…). Sans ça, Supabase n'envoie les liens de connexion qu'aux membres de l'organisation Supabase, et au maximum quelques-uns par heure.

## Carte Google Maps

**En place** : `GOOGLE_MAPS_API_KEY` est défini dans Netlify avec la clé navigateur « Maps Platform API Key » du projet Google Cloud `raysun-zonings` (jamais la « Clé serveur »). Son onglet *Référents HTTP* doit contenir `https://citywatt-ambassadeurs.netlify.app/*`, sinon Google la refuse et le site reste sur OpenStreetMap.

Sans clé, la carte utilise OpenStreetMap. Pour configurer Google Maps :

1. Google Cloud Console → APIs & Services : activer **Maps JavaScript API** et **Geocoding API** (recherche d'adresse du bouton « + »).
2. Credentials : une clé API **restreinte** — *Application restrictions* : Websites, `https://citywatt-ambassadeurs.netlify.app/*` ; *API restrictions* : les deux API ci-dessus.
3. Netlify → citywatt-ambassadeurs → Environment variables : `GOOGLE_MAPS_API_KEY` = la clé (et `GOOGLE_MAP_ID` si vous avez un Map ID). Puis redéployer.

`scripts/write-config.js` écrit la clé dans `site/config.js` au déploiement : elle n'est jamais dans le dépôt. Si Google refuse la clé, le site repasse tout seul sur OpenStreetMap.

## Notifications par email (via Odoo)

À chaque contact proposé, lieu proposé ou demande d'accès (sauf ce que l'équipe saisit elle-même), la base appelle la fonction Supabase `amb-notify` (`supabase/functions/amb-notify`), qui envoie un email via Odoo (`mail.mail` sur https://raysun.odoo.com).

Secrets à définir dans Supabase → Edge Functions → Secrets :

| Secret | Valeur |
|---|---|
| `ODOO_USERNAME` | login Odoo de l'expéditeur (ex. eric.rw@raysun.solar) |
| `ODOO_API_KEY` | clé API de cet utilisateur : Odoo → Mon profil → Sécurité du compte → Nouvelle clé API |
| `ODOO_DB` *(optionnel)* | nom de la base, `raysun` par défaut |
| `NOTIFY_EMAIL` *(optionnel)* | destinataire(s), `eric.rw@raysun.solar` par défaut |

Si l'envoi échoue, la ligne reste marquée comme non notifiée (`notified_at` vide) ; les erreurs sont visibles dans Supabase → Edge Functions → amb-notify → Logs.

## Points convertis

Sur la fiche d'un immeuble ou d'un lieu proposé, l'équipe voit un bouton « Converti : retirer de la carte ». Le point disparaît pour les actionnaires et ambassadeurs ; l'équipe peut le réafficher (case « Afficher les points convertis ») et le remettre sur la carte.

## Qui peut entrer

- **Sur invitation** : sur `admin.html`, « Qui a accès » → email, nom, rôle. La personne se connecte par lien email et a accès directement (table `amb_invites`).
- **Sur demande** : toute autre personne peut créer un compte, mais ne voit rien. Elle remplit une demande (nom, société, message) que l'équipe accepte — en choisissant le rôle — ou refuse sur `admin.html`.

| Rôle | Voit « Où nous en sommes » | Voit les contacts et lieux des autres | Noms des membres CityWatt | Suivi équipe |
|---|---|---|---|---|
| Actionnaire | Oui | Non (seulement le nombre par immeuble) | Oui | Non |
| Ambassadeur | **Non** | Non | **Non** (points seulement) | Non |
| Équipe | Oui | Oui | Oui | Oui |

Ces règles sont appliquées par la base de données (RLS), pas seulement par l'écran : même quelqu'un qui bricole le navigateur ne peut pas les contourner. Un compte de votre app qui n'est pas dans `amb_members` ne voit rien.

## Gérer les immeubles (équipe)

Sur la carte, l'équipe a :
- un bouton **« + Immeuble »** : nom, vague, priorité, adresse (bouton « Localiser » ou clic sur la carte), angle d'entrée, sociétés, propriétaire, kWc, MWh, « Où nous en sommes » ;
- sur chaque fiche : **« Modifier l'immeuble »** (et, dans le formulaire, « Supprimer cet immeuble ») ;
- sur un lieu proposé : **« Transformer en immeuble »**, qui pré-remplit le formulaire et passe le lieu en « Converti ».

C'est désormais la façon normale de faire évoluer la liste. L'import Excel ci-dessous reste possible pour un chargement en masse, mais il écrase les immeubles de même identifiant.

## Import Excel (chargement en masse)

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
  map.js                  Carte : Google Maps ou OpenStreetMap
  config.js               Configuration (réécrite au déploiement)
  vendor/                 Leaflet et supabase-js (copies locales)
supabase/
  ambassadeurs.sql        Tables, règles d'accès, fonctions
  002_demandes_suggestions_membres.sql   Demandes d'accès, lieux proposés, membres
  003_convertis_notifications.sql        Points convertis, déclencheurs de notification
  004_suppression.sql                    Suppression par l'équipe (contacts, lieux, demandes)
  005_gestion_immeubles.sql              Ajout / modification des immeubles par l'équipe
  functions/amb-notify/   Envoi des notifications via Odoo
  immeubles.sql           Données des immeubles (généré)
scripts/import-excel.js   Excel → data/leads.json + supabase/immeubles.sql
scripts/write-config.js   Variables Netlify → site/config.js (étape de build)
data/                     Excel source et coordonnées
```
