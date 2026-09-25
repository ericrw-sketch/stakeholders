// Valeurs par défaut pour le développement local. Sur Netlify, ce fichier est réécrit
// par scripts/write-config.js à partir des variables d'environnement du projet.
// La clé publishable Supabase est faite pour être publique : ce sont les règles RLS qui protègent les données.
window.CITYWATT_CONFIG = {
  supabaseUrl: 'https://wrexwthjavagzumuzlxx.supabase.co',
  supabaseAnonKey: 'sb_publishable_goUz22udgiPHgB7HDxoLVQ_ZKINIdFX',
  googleMapsApiKey: '', // vide = OpenStreetMap
  googleMapId: '',
};
