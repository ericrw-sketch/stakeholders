// Exécuté par Netlify à chaque déploiement : écrit site/config.js à partir des variables
// d'environnement du projet Netlify, pour ne pas mettre la clé Google dans le code.
//   GOOGLE_MAPS_API_KEY  clé navigateur Google Maps (restreinte au domaine du site). Par défaut :
//                        « Maps Platform API Key » du projet Google Cloud raysun-zonings. Une clé
//                        navigateur est visible dans la page par nature : c'est sa restriction
//                        « Référents HTTP » qui la protège.
//   GOOGLE_MAP_ID        optionnel : Map ID Google (sinon carte de démonstration)
// Sans clé Google, la carte utilise OpenStreetMap.
const fs = require('fs');
const path = require('path');

const config = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://wrexwthjavagzumuzlxx.supabase.co',
  supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_goUz22udgiPHgB7HDxoLVQ_ZKINIdFX',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyBd_AWJ5eYOGHVWc6H3wTeQ45Z1fcyXWds',
  googleMapId: process.env.GOOGLE_MAP_ID || '',
};

fs.writeFileSync(
  path.join(__dirname, '..', 'site', 'config.js'),
  `// Généré par scripts/write-config.js au déploiement.\nwindow.CITYWATT_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
);
console.log(`config.js écrit (carte : ${config.googleMapsApiKey ? 'Google Maps' : 'OpenStreetMap'})`);
