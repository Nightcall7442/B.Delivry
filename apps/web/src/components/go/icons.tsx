/** Inline stroke icons, 24-grid. No icon package for six glyphs. */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const ArrowLeft = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

export const Burger = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const Bag = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export const Chevron = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    {...stroke}
    className="shrink-0 text-ink-faint"
    aria-hidden
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const Phone = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z" />
  </svg>
);

export const Chat = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const Check = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} strokeWidth={3} aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const HomeGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10" />
  </svg>
);

export const Receipt = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3ZM9 8h6M9 12h6" />
  </svg>
);

export const Search = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const Banknote = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

export const Card = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20M6 15h4" />
  </svg>
);

export const Smartphone = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" {...stroke} aria-hidden>
    <rect x="6" y="2" width="12" height="20" rx="2" />
    <path d="M11 18h2" />
  </svg>
);

export const Target = ({ size = 22 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const Basket = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M3 10h18l-1.5 9a2 2 0 0 1-2 1.7h-11a2 2 0 0 1-2-1.7L3 10ZM8 10l4-6 4 6M9 14v3M15 14v3M12 14v3" />
  </svg>
);

export const Coin = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2.2} aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.4 9.7a3.2 3.2 0 1 0 0 4.6" />
  </svg>
);

export const Grid = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </svg>
);

export const Star = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z" />
  </svg>
);

export const Tag = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </svg>
);

export const ListGlyph = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

export const Repeat = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="m17 2 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const Leaf = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden>
    <path d="M4 20c0-9 5-15 16-16-1 11-7 16-16 16Z" />
    <path d="M4 20c4-5 8-8 12-10" />
  </svg>
);
