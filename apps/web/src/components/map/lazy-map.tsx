/**
 * The map, loaded when a screen actually shows one.
 *
 * maplibre is about 280 KB of script: imported statically by the shell every page shares, the
 * rules, the documents and the invite page paid for it on a phone's mobile data without drawing a
 * single tile. Here it is a separate chunk that arrives after the page is already usable, and only
 * on the screens that have a map.
 */
'use client';

import dynamic from 'next/dynamic';

export type { MapViewProps, MapMarker } from './map-view';

export const MapView = dynamic(() => import('./map-view').then((module) => module.MapView), {
  ssr: false,
  // The ground the map is drawn on, so the page does not jump when the chunk lands.
  loading: () => (
    <div
      aria-hidden
      style={{ position: 'absolute', inset: 0, background: 'var(--ground-deep, #0e1a33)' }}
    />
  ),
});
