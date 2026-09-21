/**
 * The map behind every GO-style screen.
 *
 * Yandex Maps 3.0 when NEXT_PUBLIC_YANDEX_MAPS_API_KEY is set; otherwise
 * MapLibre with OpenFreeMap's vector tiles — free, keyless, and a real map of
 * Tashkent rather than a placeholder. The kraft-paper canvas remains as the
 * last resort when neither can load (offline, blocked CDN).
 *
 * Markers are plain DOM nodes styled by `.map-pin` classes in globals.css, so
 * every renderer draws the same majolica tiles.
 */
'use client';

import type { LatLngDto } from '@bazar/types';
import {
  Map as LibreGl,
  Marker as LibreMarker,
  setWorkerUrl,
  type ErrorEvent as LibreError,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

import {
  loadYmaps,
  type LngLat,
  type YMapInstance,
  type YMapMarkerInstance,
  type Ymaps3,
} from '@/lib/map/ymaps';

export type MarkerKind = 'store' | 'home' | 'courier';

export interface MapMarker {
  id: string;
  point: LatLngDto;
  kind: MarkerKind;
  label?: string;
}

export interface MapViewProps {
  center: LatLngDto;
  zoom?: number;
  markers?: readonly MapMarker[];
  /** Draw the fixed centre pin and report where the map stops (address picking). */
  pin?: boolean;
  onMoveEnd?: (center: LatLngDto) => void;
  /** Share of the viewport under the mobile sheet, so the visual centre sits in the visible part. */
  inset?: number;
  interactive?: boolean;
}

/** Light, quiet basemap: the tiles and the sheet are the colour, not the streets. */
export const FREE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// The worker MapLibre would look for next to its bundle is copied to /maplibre
// by scripts/maplibre-worker.mjs (webpack leaves import.meta.url as file://).
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const toLngLat = (p: LatLngDto): LngLat => [p.lng, p.lat];

/** Static SVG, stroke-only, 24-grid — the same three glyphs the sheet uses. */
const STROKE =
  'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const PIN_SVG: Record<MarkerKind, string> = {
  // A market basket.
  store: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 10h18l-1.5 9a2 2 0 0 1-2 1.7h-11a2 2 0 0 1-2-1.7L3 10Z"/><path d="M8 10 12 4l4 6M9 14v3M15 14v3M12 14v3"/></svg>`,
  // A house.
  home: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>`,
  // A scooter.
  courier: `<svg viewBox="0 0 24 24" ${STROKE}><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17H14l2-8h3"/><path d="M14 9h-4l-2 4"/><path d="M15.5 5H19"/></svg>`,
};

function pinElement(marker: MapMarker): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `map-pin map-pin--${marker.kind}`;
  const glyph = document.createElement('span');
  glyph.className = 'map-pin__glyph';
  glyph.innerHTML = PIN_SVG[marker.kind];
  el.appendChild(glyph);
  if (marker.label) {
    const label = document.createElement('span');
    label.className = 'map-pin__label';
    label.textContent = marker.label;
    el.appendChild(label);
  }
  return el;
}

type Engine = 'maplibre' | 'none';

export function MapView({
  center,
  zoom = 14,
  markers = [],
  pin = false,
  onMoveEnd,
  inset = 0,
  interactive = true,
}: MapViewProps) {
  const [ymaps, setYmaps] = useState<Ymaps3 | null | undefined>(undefined);
  const [engine, setEngine] = useState<Engine>('maplibre');

  useEffect(() => {
    let alive = true;
    loadYmaps().then((loaded) => alive && setYmaps(loaded));
    return () => {
      alive = false;
    };
  }, []);

  const common = { center, zoom, markers, pin, onMoveEnd, interactive };

  return (
    <div
      className="absolute inset-x-0 top-0 bottom-[calc(var(--map-inset)-24px)] bg-sand-100 md:bottom-0 md:left-[436px]"
      style={{ '--map-inset': `${inset * 100}%` } as CSSProperties}
    >
      {ymaps ? (
        <YandexMap api={ymaps} {...common} />
      ) : engine === 'maplibre' ? (
        <LibreMap {...common} onFail={() => setEngine('none')} />
      ) : (
        <FallbackMap {...common} />
      )}
      {pin ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2">
          <div className="map-pin-anchor">
            <div className="map-pin map-pin--home map-pin--centre">
              <span className="map-pin__glyph" dangerouslySetInnerHTML={{ __html: PIN_SVG.home }} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type RendererProps = Required<
  Pick<MapViewProps, 'center' | 'zoom' | 'markers' | 'pin' | 'interactive'>
> & {
  onMoveEnd: MapViewProps['onMoveEnd'] | undefined;
};

function LibreMap({
  center,
  zoom,
  markers,
  onMoveEnd,
  interactive,
  onFail,
}: RendererProps & { onFail: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LibreGl | null>(null);
  const pins = useRef(new Map<string, LibreMarker>());
  const moveEnd = useRef(onMoveEnd);
  moveEnd.current = onMoveEnd;
  const fail = useRef(onFail);
  fail.current = onFail;

  useEffect(() => {
    if (!host.current) return;
    let instance: LibreGl;
    try {
      instance = new LibreGl({
        container: host.current,
        style: FREE_STYLE,
        center: toLngLat(center),
        zoom,
        interactive,
        attributionControl: { compact: true },
        maxZoom: 18,
      });
    } catch {
      // No WebGL2 (old Android WebView, a GPU-less session): the flat map, not a crash.
      fail.current();
      return;
    }
    instance.on('moveend', () => {
      const c = instance.getCenter();
      moveEnd.current?.({ lat: c.lat, lng: c.lng });
    });
    // A style that never arrives (offline, blocked host) is the only error worth
    // falling back for; a single missing tile is not.
    instance.on('error', (event: LibreError) => {
      if (String(event.error?.message ?? '').includes('styles/')) fail.current();
    });
    map.current = instance;
    if (process.env.NODE_ENV !== 'production')
      (window as unknown as { __map?: LibreGl }).__map = instance;
    const pinsOfThisMap = pins.current;
    return () => {
      instance.remove();
      map.current = null;
      pinsOfThisMap.clear();
    };
    // Created once; centre/zoom changes go through easeTo below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.easeTo({ center: toLngLat(center), zoom, duration: 400 });
  }, [center.lat, center.lng, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.id);
      const existing = pins.current.get(marker.id);
      if (existing) {
        existing.setLngLat(toLngLat(marker.point));
        continue;
      }
      // MapLibre owns the element's transform, so the pin sits in a wrapper it can move.
      const wrapper = document.createElement('div');
      wrapper.style.zIndex = marker.kind === 'courier' ? '2' : '1';
      wrapper.appendChild(pinElement(marker));
      const created = new LibreMarker({ element: wrapper, anchor: 'bottom' })
        .setLngLat(toLngLat(marker.point))
        .addTo(instance);
      pins.current.set(marker.id, created);
    }
    for (const [id, existing] of pins.current) {
      if (seen.has(id)) continue;
      existing.remove();
      pins.current.delete(id);
    }
  }, [markers]);

  return <div ref={host} className="h-full w-full" />;
}

function YandexMap({
  api,
  center,
  zoom,
  markers,
  onMoveEnd,
  interactive,
}: RendererProps & { api: Ymaps3 }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<YMapInstance | null>(null);
  const pins = useRef(new Map<string, YMapMarkerInstance>());
  const moveEnd = useRef(onMoveEnd);
  moveEnd.current = onMoveEnd;

  useEffect(() => {
    if (!host.current) return;
    const instance = new api.YMap(host.current, {
      location: { center: toLngLat(center), zoom },
      behaviors: interactive ? ['drag', 'scrollZoom', 'pinchZoom', 'dblClick'] : [],
    });
    instance.addChild(new api.YMapDefaultSchemeLayer({}));
    instance.addChild(new api.YMapDefaultFeaturesLayer({}));
    instance.addChild(
      new api.YMapListener({
        onActionEnd: ({ location }) =>
          moveEnd.current?.({ lng: location.center[0], lat: location.center[1] }),
      }),
    );
    map.current = instance;
    const pinsOfThisMap = pins.current;
    return () => {
      instance.destroy();
      map.current = null;
      pinsOfThisMap.clear();
    };
    // The map is created once; centre/zoom changes go through setLocation below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    map.current?.setLocation({ center: toLngLat(center), zoom, duration: 400 });
  }, [center.lat, center.lng, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.id);
      const existing = pins.current.get(marker.id);
      if (existing) {
        existing.update({ coordinates: toLngLat(marker.point) });
        continue;
      }
      // Yandex anchors the element's top-left corner: the wrapper pulls the tip onto the point.
      const wrapper = document.createElement('div');
      wrapper.className = 'map-pin-anchor';
      wrapper.appendChild(pinElement(marker));
      const created = new api.YMapMarker(
        { coordinates: toLngLat(marker.point), zIndex: marker.kind === 'courier' ? 2 : 1 },
        wrapper,
      );
      instance.addChild(created);
      pins.current.set(marker.id, created);
    }
    for (const [id, existing] of pins.current) {
      if (seen.has(id)) continue;
      instance.removeChild(existing);
      pins.current.delete(id);
    }
  }, [api, markers]);

  return <div ref={host} className="h-full w-full" />;
}

/**
 * Equirectangular projection around the centre — the same maths tile servers
 * use, minus the tiles. Draggable so the address pin can still be placed.
 */
function FallbackMap({ center, zoom, markers, onMoveEnd, interactive }: RendererProps) {
  const [view, setView] = useState(center);
  const drag = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);

  useEffect(() => setView(center), [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const cosLat = Math.cos((view.lat * Math.PI) / 180);
  const metersPerPx = (156543.03 * cosLat) / 2 ** zoom;
  const project = (p: LatLngDto) => ({
    x: ((p.lng - view.lng) * 111_320 * cosLat) / metersPerPx,
    y: -((p.lat - view.lat) * 110_540) / metersPerPx,
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    drag.current = { x: event.clientX, y: event.clientY, lat: view.lat, lng: view.lng };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    setView({
      lat: start.lat + (dy * metersPerPx) / 110_540,
      lng: start.lng - (dx * metersPerPx) / (111_320 * cosLat),
    });
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    onMoveEnd?.(view);
  };

  return (
    <div
      className={`map-fallback relative h-full w-full select-none overflow-hidden ${interactive ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {markers.map((marker) => {
        const { x, y } = project(marker.point);
        // Integers only: the server and the browser must serialise the style identically.
        return (
          <div
            key={marker.id}
            className="absolute left-1/2 top-1/2"
            style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` }}
          >
            <div className="map-pin-anchor">
              <div className={`map-pin map-pin--${marker.kind}`}>
                <span
                  className="map-pin__glyph"
                  dangerouslySetInnerHTML={{ __html: PIN_SVG[marker.kind] }}
                />
                {marker.label ? <span className="map-pin__label">{marker.label}</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
