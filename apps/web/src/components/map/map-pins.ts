/**
 * The three marker glyphs, apart from the map itself: a screen that only draws a pin in its own
 * markup (the address sheet) must not pull the map library in with it.
 */
export type MarkerKind = 'store' | 'home' | 'courier';

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
