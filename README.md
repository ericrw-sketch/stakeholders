# CityWatt — Plateforme ambassadeurs

Carte des immeubles bruxellois ciblés par CityWatt. Les actionnaires (puis les ambassadeurs) cliquent sur un immeuble, lisent la fiche issue de l'Excel, et choisissent l'un des deux chemins :

- **Je fais l'introduction** : ils nous mettent en relation eux-mêmes ;
- **Je vous donne le contact** : ils transmettent les coordonnées et nous approchons la personne.

L'équipe suit toutes les propositions sur `/admin.html` et les exporte en Excel au format de l'onglet « Vos contacts ».

## Démarrer en local

```bash
npm install
npm start          # http://localhost:3000
```

Codes d'accès par défaut (en local uniquement) : `actionnaire`, `ambassadeur`, `admin`.

## Publics et droits

| Code | Rôle | Voit « Où nous en sommes » | Accès au suivi équipe |
|---|---|---|---|
| `SHAREHOLDER_CODE` | Actionnaire | Oui | Non |
| `AMBASSADOR_CODE` | Ambassadeur (non-actionnaire) | **Non** | Non |
| `ADMIN_CODE` | Équipe RaYSun | Oui | Oui |

La colonne « Où nous en sommes » contient des notes internes (noms, historique) : elle est masquée côté serveur pour les ambassadeurs. Pour masquer d'autres champs, ajoutez-les à `INTERNAL_FIELDS` dans `server.js`.

## Mettre à jour les immeubles

1. Modifiez l'Excel (onglet « Immeubles », mêmes en-têtes de colonnes) et remplacez `data/leads.xlsx`.
2. Si vous ajoutez un immeuble, ajoutez ses coordonnées dans `data/coordinates.json` (clé = nom exact de la colonne « Immeuble / site »). Clic droit sur Google Maps → les coordonnées s'affichent.
3. Lancez `npm run import` puis redémarrez le serveur.

Les coordonnées actuelles sont **approximatives** : à vérifier une fois, surtout Four à Briques, Toyota, Cora et Putman.

## Mise en ligne

N'importe quel hébergeur Node convient (Render, Railway, Fly.io, un petit VPS…). Variables à définir :

```
NODE_ENV=production
SESSION_SECRET=<longue chaîne aléatoire>
SHAREHOLDER_CODE=<code actionnaires>
AMBASSADOR_CODE=<code ambassadeurs>
ADMIN_CODE=<code équipe>
DATA_DIR=/chemin/vers/un/disque/persistant   # où est stocké contributions.json
```

Le serveur refuse de démarrer en production si l'un des codes ou le secret manque.

Les propositions sont stockées dans `contributions.json` (dans `DATA_DIR`). Sur un hébergeur à disque éphémère, montez un volume persistant sur `DATA_DIR`, sinon les données sont perdues à chaque redéploiement.

## Structure

```
server.js                 API + fichiers statiques
scripts/import-excel.js   Excel → data/leads.json
data/leads.xlsx           Excel source
data/coordinates.json     Coordonnées GPS par immeuble
data/leads.json           Généré par l'import
public/index.html|app.js  Carte, fiche, formulaire
public/admin.html         Suivi équipe + export Excel
```

## Pistes suivantes

- Notification email à l'équipe à chaque nouveau contact.
- Lien personnel par actionnaire au lieu d'un code partagé.
- Base de données (Postgres/SQLite) si le volume grandit.
