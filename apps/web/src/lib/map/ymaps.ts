/**
 * Yandex Maps JS API 3.0 loader.
 *
 * The SDK is a global script, not an npm package, so it is injected once and
 * every map on the page awaits the same promise. Without an API key the loader
 * resolves to null and callers fall back to the static map — the flow keeps
 * working in dev, the real tiles appear the moment the key is set.
 */
export type LngLat = [lng: number, lat: number];

export interface YMapLocation {
  center: LngLat;
  zoom: number;
  duration?: number;
}

/** The handful of ymaps3 members the storefront uses. */
export interface Ymaps3 {
  ready: Promise<void>;
  YMap: new (
    el: HTMLElement,
    props: {
      location: YMapLocation;
      behaviors?: string[];
      zoomRange?: { min: number; max: number };
    },
  ) => YMapInstance;
  YMapDefaultSchemeLayer: new (props: Record<string, unknown>) => YMapChild;
  YMapDefaultFeaturesLayer: new (props: Record<string, unknown>) => YMapChild;
  YMapMarker: new (
    props: { coordinates: LngLat; zIndex?: number },
    el: HTMLElement,
  ) => YMapMarkerInstance;
  YMapListener: new (props: {
    onUpdate?: (event: { location: { center: LngLat; zoom: number } }) => void;
    onActionEnd?: (event: { location: { center: LngLat; zoom: number } }) => void;
  }) => YMapChild;
  search?: (params: { text: string; bounds?: [LngLat, LngLat] }) => Promise<
    Array<{
      properties?: { name?: string; description?: string };
      geometry?: { coordinates: LngLat };
    }>
  >;
}

/** Anything addChild/removeChild accept; the SDK's own base class is opaque to us. */
export type YMapChild = object;

export interface YMapMarkerInstance {
  update: (props: { coordinates: LngLat; zIndex?: number }) => void;
}

export interface YMapInstance {
  addChild: (child: YMapChild) => void;
  removeChild: (child: YMapChild) => void;
  setLocation: (location: YMapLocation) => void;
  destroy: () => void;
}

declare global {
  interface Window {
    ymaps3?: Ymaps3;
  }
}

export const YANDEX_MAPS_KEY = process.env['NEXT_PUBLIC_YANDEX_MAPS_API_KEY'] ?? '';

let loading: Promise<Ymaps3 | null> | null = null;

export function loadYmaps(lang = 'ru_RU'): Promise<Ymaps3 | null> {
  if (typeof window === 'undefined' || !YANDEX_MAPS_KEY) return Promise.resolve(null);
  if (window.ymaps3) return window.ymaps3.ready.then(() => window.ymaps3 ?? null);
  if (loading) return loading;

  loading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(YANDEX_MAPS_KEY)}&lang=${lang}`;
    script.async = true;
    script.onload = () => {
      const api = window.ymaps3;
      if (!api) return resolve(null);
      api.ready.then(
        () => resolve(api),
        () => resolve(null),
      );
    };
    // A bad key or a blocked CDN: the static fallback is better than a blank box.
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}

/** Reverse geocode through the SDK; null when the SDK or the lookup is unavailable. */
export async function describePoint(api: Ymaps3, point: LngLat): Promise<string | null> {
  if (!api.search) return null;
  try {
    const [hit] = await api.search({ text: `${point[0]},${point[1]}` });
    return hit?.properties?.name ?? null;
  } catch {
    return null;
  }
}
