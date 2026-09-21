/**
 * The page inside the map WebView: Yandex Maps JS API 3.0 with a key, MapLibre
 * over OpenFreeMap's free vector tiles without one — plus the tile markers,
 * driven from React Native through `window.__map.update(...)` and answering
 * with `ReactNativeWebView.postMessage`. On the web the same page sits in an
 * iframe and the two talk through `postMessage` instead.
 *
 * ponytail: a WebView keeps the exact same map as the web app and runs in Expo
 * Go. Swap for native MapKit (react-native-yamap, dev build) when the WebView
 * scroll feel becomes the complaint.
 */
export interface MapState {
  center: { lat: number; lng: number };
  zoom: number;
  markers: Array<{
    id: string;
    lat: number;
    lng: number;
    kind: 'store' | 'home' | 'courier';
    label?: string;
  }>;
  interactive: boolean;
}

/** The newest MapLibre cdnjs carries in full (6.x ships CSS only there); same Map/Marker API as the npm build the web app uses. */
const MAPLIBRE = '5.6.0';
/** Light, quiet basemap: the tiles and the sheet are the colour, not the streets. */
const FREE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

export function mapHtml(apiKey: string, lang = 'ru_RU'): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
${apiKey ? '' : `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${MAPLIBRE}/maplibre-gl.css">`}
<style>
  html, body, #map { margin: 0; height: 100%; background: #f4ede1; overflow: hidden; }
  .maplibregl-ctrl-attrib { font-size: 10px; color: #71767B; background: rgba(255,255,255,.8); border-radius: 6px; }
  .maplibregl-ctrl-logo { display: none !important; }
  .maplibregl-marker .map-pin { transform: none; }
  .map-pin { pointer-events: none; display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; transform: translate(-50%, -100%); font-family: -apple-system, Roboto, sans-serif; }
  .map-pin__glyph { width: 36px; height: 36px; margin: 6px 0 8px; border-radius: 10px; background: #9E2A2B; color: #fff; display: flex; align-items: center; justify-content: center; transform: rotate(45deg); box-shadow: 0 12px 32px rgba(27,31,34,.12); }
  .map-pin__glyph svg { width: 20px; height: 20px; transform: rotate(-45deg); }
  .map-pin--home .map-pin__glyph { background: #E39B2F; color: #2B1B0E; }
  .map-pin--courier .map-pin__glyph { width: 44px; height: 44px; margin: 0; border-radius: 22px; transform: none; background: #fff; color: #7E1F21; box-shadow: 0 0 0 4px rgba(158,42,43,.3), 0 12px 32px rgba(27,31,34,.12); }
  .map-pin--courier .map-pin__glyph svg { width: 24px; height: 24px; transform: none; }
  .map-pin__label { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: rgba(255,255,255,.95); border-radius: 8px; padding: 2px 8px; font-size: 11px; font-weight: 700; color: #1B1F22; box-shadow: 0 2px 12px rgba(27,31,34,.06); }
</style></head>
<body><div id="map"></div>
${
  apiKey
    ? `<script src="https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=${lang}"></script>`
    : `<script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/${MAPLIBRE}/maplibre-gl.js"></script>`
}
<script>
(function () {
  var S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  var SVG = {
    store: '<svg viewBox="0 0 24 24" ' + S + '><path d="M3 10h18l-1.5 9a2 2 0 0 1-2 1.7h-11a2 2 0 0 1-2-1.7L3 10Z"/><path d="M8 10 12 4l4 6M9 14v3M15 14v3M12 14v3"/></svg>',
    home: '<svg viewBox="0 0 24 24" ' + S + '><path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>',
    courier: '<svg viewBox="0 0 24 24" ' + S + '><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17H14l2-8h3"/><path d="M14 9h-4l-2 4"/><path d="M15.5 5H19"/></svg>'
  };
  var send = function (msg) {
    var text = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
    else if (window.parent !== window) window.parent.postMessage(text, '*');
  };
  var pending = null, map = null, pins = {}, api = null;
  // Every way the page can die names itself, so the app can log the reason.
  var fail = function (reason) { send({ type: 'error', reason: reason }); };
  window.onerror = function (message) { fail('js: ' + message); };

  function el(m) {
    var d = document.createElement('div');
    d.className = 'map-pin map-pin--' + m.kind;
    var g = document.createElement('span'); g.className = 'map-pin__glyph'; g.innerHTML = SVG[m.kind]; d.appendChild(g);
    if (m.label) { var l = document.createElement('span'); l.className = 'map-pin__label'; l.textContent = m.label; d.appendChild(l); }
    return d;
  }

  function apply(state) {
    if (!map) { pending = state; return; }
    map.setLocation({ center: [state.center.lng, state.center.lat], zoom: state.zoom, duration: 400 });
    var seen = {};
    state.markers.forEach(function (m) {
      seen[m.id] = true;
      if (pins[m.id]) { pins[m.id].update({ coordinates: [m.lng, m.lat] }); return; }
      var p = new api.YMapMarker({ coordinates: [m.lng, m.lat], zIndex: m.kind === 'courier' ? 2 : 1 }, el(m));
      map.addChild(p); pins[m.id] = p;
    });
    Object.keys(pins).forEach(function (id) { if (!seen[id]) { map.removeChild(pins[id]); delete pins[id]; } });
  }

  window.__map = { update: apply };
  if (window.parent !== window) window.addEventListener('message', function (e) {
    try { var m = JSON.parse(e.data); if (m && m.type === 'update') apply(m.state); } catch (err) { /* not ours */ }
  });

  function bootLibre() {
    if (!window.maplibregl) { fail('maplibre script did not load (cdnjs)'); return; }
    var probe = document.createElement('canvas');
    if (!probe.getContext('webgl2')) { fail('no WebGL2'); return; }
    var init = pending || { center: { lat: 41.3111, lng: 69.2797 }, zoom: 13, markers: [], interactive: true };
    var m = new maplibregl.Map({
      container: 'map', style: '${FREE_STYLE}', center: [init.center.lng, init.center.lat], zoom: init.zoom,
      interactive: init.interactive, attributionControl: { compact: true }, maxZoom: 18
    });
    m.on('moveend', function () { var c = m.getCenter(); send({ type: 'moveEnd', lat: c.lat, lng: c.lng }); });
    m.on('error', function (e) { var text = String(e && e.error && e.error.message || ''); if (text.indexOf('styles/') >= 0) fail('style: ' + text); });
    // Same API surface as the Yandex branch, so apply() does not care which engine runs.
    api = {
      YMapMarker: function (props, el) {
        var wrap = document.createElement('div'); wrap.style.zIndex = props.zIndex || 1; wrap.appendChild(el);
        var mk = new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat(props.coordinates);
        return { _mk: mk, update: function (p) { mk.setLngLat(p.coordinates); } };
      }
    };
    map = {
      setLocation: function (l) { m.easeTo({ center: l.center, zoom: l.zoom, duration: l.duration || 0 }); },
      addChild: function (p) { p._mk.addTo(m); },
      removeChild: function (p) { p._mk.remove(); }
    };
    send({ type: 'ready' });
    if (pending) { var p = pending; pending = null; apply(p); }
  }

  function boot() {
    if (${apiKey ? 'false' : 'true'}) return bootLibre();
    if (!window.ymaps3) { fail('yandex script did not load'); return; }
    ymaps3.ready.then(function () {
      api = ymaps3;
      var init = pending || { center: { lat: 41.3111, lng: 69.2797 }, zoom: 13, markers: [], interactive: true };
      map = new api.YMap(document.getElementById('map'), {
        location: { center: [init.center.lng, init.center.lat], zoom: init.zoom },
        behaviors: init.interactive ? ['drag', 'pinchZoom', 'dblClick'] : []
      });
      map.addChild(new api.YMapDefaultSchemeLayer({}));
      map.addChild(new api.YMapDefaultFeaturesLayer({}));
      map.addChild(new api.YMapListener({ onActionEnd: function (e) { send({ type: 'moveEnd', lat: e.location.center[1], lng: e.location.center[0] }); } }));
      send({ type: 'ready' });
      if (pending) { var p = pending; pending = null; apply(p); }
    }, function () { fail('yandex not ready'); });
  }
  boot();
})();
</script></body></html>`;
}
