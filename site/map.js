// Carte : Google Maps si une clé est configurée, sinon OpenStreetMap (Leaflet).
// Les deux implémentations exposent la même interface à app.js :
//   addMarker({ lat, lng, html, title, zIndex, onClick }) -> { setHtml, show, hide }
//   flyTo(lat, lng, zoom), fitBounds([[lat, lng], ...]), getZoom(), onZoom(cb),
//   onMapClick(cb | null), geocode(adresse) -> { lat, lng, address } | null

const BRUSSELS = { lat: 50.85, lng: 4.36 };

function markerElement(html) {
  const el = document.createElement('div');
  el.className = 'mk';
  el.innerHTML = html;
  return el;
}

// --- Google Maps ------------------------------------------------------------------

function loadGoogleScript(key) {
  return new Promise((resolve, reject) => {
    window.__cwGoogleReady = resolve;
    // Clé refusée par Google (mauvaise clé, domaine non autorisé…) : on repasse sur OpenStreetMap.
    window.gm_authFailure = () => {
      try { sessionStorage.setItem('cw-map-fallback', '1'); } catch {}
      location.reload();
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`
      + '&v=weekly&libraries=marker&loading=async&language=fr&region=BE&callback=__cwGoogleReady';
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function createGoogleMap(el, { key, mapId }) {
  await loadGoogleScript(key);
  const { Map, MapTypeControlStyle } = await google.maps.importLibrary('maps');
  const { AdvancedMarkerElement } = await google.maps.importLibrary('marker');
  const { ControlPosition } = await google.maps.importLibrary('core');
  const map = new Map(el, {
    center: BRUSSELS, zoom: 12, mapId: mapId || 'DEMO_MAP_ID',
    // Bouton « Plan / Satellite » (satellite avec noms de rues : utile pour repérer les toitures).
    mapTypeControl: true,
    mapTypeControlOptions: {
      mapTypeIds: ['roadmap', 'hybrid'],
      style: MapTypeControlStyle.HORIZONTAL_BAR,
      position: ControlPosition.TOP_LEFT,
    },
    streetViewControl: false, fullscreenControl: false, clickableIcons: false,
  });
  let clickHandler = null;
  map.addListener('click', (e) => clickHandler && clickHandler(e.latLng.lat(), e.latLng.lng()));

  return {
    kind: 'google',
    addMarker({ lat, lng, html, title, zIndex, onClick }) {
      // .mk fait 0×0 px et ses enfants sont centrés dessus en CSS : l'ancrage tombe pile sur le point.
      const content = markerElement(html);
      const m = new AdvancedMarkerElement({ position: { lat, lng }, content, title, zIndex, gmpClickable: !!onClick });
      if (onClick) m.addListener('click', onClick);
      return {
        setHtml(h) { content.innerHTML = h; },
        show() { if (!m.map) m.map = map; },
        hide() { m.map = null; },
      };
    },
    flyTo(lat, lng, zoom) { map.panTo({ lat, lng }); if (zoom) map.setZoom(Math.max(map.getZoom(), zoom)); },
    fitBounds(points) {
      const b = new google.maps.LatLngBounds();
      points.forEach(([lat, lng]) => b.extend({ lat, lng }));
      map.fitBounds(b, 40);
    },
    getZoom: () => map.getZoom(),
    onZoom(cb) { map.addListener('zoom_changed', cb); },
    onMapClick(cb) { clickHandler = cb; map.setOptions({ draggableCursor: cb ? 'crosshair' : null }); },
    async geocode(address) {
      const { Geocoder } = await google.maps.importLibrary('geocoding');
      const { results } = await new Geocoder().geocode({ address, region: 'BE' }).catch(() => ({ results: [] }));
      if (!results.length) return null;
      const loc = results[0].geometry.location;
      return { lat: loc.lat(), lng: loc.lng(), address: results[0].formatted_address };
    },
  };
}

// --- OpenStreetMap (Leaflet) --------------------------------------------------------

function createLeafletMap(el) {
  const map = L.map(el, { zoomControl: true }).setView([BRUSSELS.lat, BRUSSELS.lng], 12);
  // Fond de carte OpenStreetMap : gratuit, sans clé (usage modéré, attribution obligatoire).
  const plan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  // Vue satellite de secours (Esri World Imagery, gratuite, attribution obligatoire).
  const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Imagerie &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  });
  L.control.layers({ Plan: plan, Satellite: satellite }, null, { position: 'topleft', collapsed: false }).addTo(map);
  let clickHandler = null;
  map.on('click', (e) => clickHandler && clickHandler(e.latlng.lat, e.latlng.lng));

  return {
    kind: 'osm',
    addMarker({ lat, lng, html, title, zIndex, onClick }) {
      const icon = (h) => L.divIcon({ className: '', html: `<div class="mk">${h}</div>`, iconSize: [0, 0] });
      const m = L.marker([lat, lng], { icon: icon(html), title, zIndexOffset: zIndex || 0, interactive: !!onClick });
      if (onClick) m.on('click', onClick);
      return {
        setHtml(h) { m.setIcon(icon(h)); },
        show() { if (!map.hasLayer(m)) m.addTo(map); },
        hide() { m.remove(); },
      };
    },
    flyTo(lat, lng, zoom) { map.flyTo([lat, lng], Math.max(map.getZoom(), zoom || 0), { duration: 0.5 }); },
    fitBounds(points) { map.fitBounds(points, { padding: [40, 40] }); },
    getZoom: () => map.getZoom(),
    onZoom(cb) { map.on('zoomend', cb); },
    onMapClick(cb) { clickHandler = cb; el.style.cursor = cb ? 'crosshair' : ''; },
    async geocode(address) {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=be&q='
        + encodeURIComponent(address);
      const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } }).catch(() => null);
      const [hit] = res && res.ok ? await res.json() : [];
      return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), address: hit.display_name } : null;
    },
  };
}

async function createMap(el) {
  const cfg = window.CITYWATT_CONFIG || {};
  let fallback = false;
  try { fallback = sessionStorage.getItem('cw-map-fallback') === '1'; } catch {}
  if (cfg.googleMapsApiKey && !fallback) {
    try {
      return await createGoogleMap(el, { key: cfg.googleMapsApiKey, mapId: cfg.googleMapId });
    } catch (e) {
      console.error('Google Maps indisponible, passage sur OpenStreetMap', e);
      el.innerHTML = '';
    }
  }
  return createLeafletMap(el);
}
