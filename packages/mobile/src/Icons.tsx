/** Stroke icons on a 24-grid, the same paths the web uses. */
import Svg, { Circle, Path } from 'react-native-svg';

import { color } from './theme';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Solid icons (a rated star): fill colour instead of the default hollow. */
  fill?: string;
}

function make(paths: string[], extra?: { circles?: Array<[number, number, number]> }) {
  return function Icon({
    size = 22,
    color: stroke = color.ink,
    strokeWidth = 2,
    fill = 'none',
  }: IconProps) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {extra?.circles?.map(([cx, cy, r]) => (
          <Circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />
        ))}
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    );
  };
}

export const ArrowLeft = make(['M19 12H5M12 19l-7-7 7-7']);
export const Burger = make(['M4 7h16M4 12h16M4 17h16']);
export const Bag = make([
  'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 0 1-8 0',
]);
export const Chevron = make(['m9 18 6-6-6-6']);
export const Phone = make([
  'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.7a2 2 0 0 1 1.7 2z',
]);
export const Chat = make(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']);
export const Check = make(['M20 6 9 17l-5-5']);
export const Home = make(['M3 11 12 3l9 8', 'M5 10v10h5v-6h4v6h5V10']);
export const Basket = make([
  'M3 10h18l-1.5 9a2 2 0 0 1-2 1.7h-11a2 2 0 0 1-2-1.7L3 10Z',
  'M8 10 12 4l4 6M9 14v3M15 14v3M12 14v3',
]);
export const Scooter = make(['M8.5 17H14l2-8h3', 'M14 9h-4l-2 4', 'M15.5 5H19'], {
  circles: [
    [6, 17, 2.5],
    [18, 17, 2.5],
  ],
});
export const Receipt = make([
  'M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3ZM9 8h6M9 12h6',
]);
export const Search = make(['m20 20-3.5-3.5'], { circles: [[11, 11, 7]] });
export const Banknote = make(
  ['M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8Z', 'M6 12h.01M18 12h.01'],
  { circles: [[12, 12, 2.5]] },
);
export const Card = make([
  'M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Z',
  'M2 10h20M6 15h4',
]);
export const Smartphone = make([
  'M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4Z',
  'M11 18h2',
]);
export const Leaf = make(['M4 20c0-9 5-15 16-16-1 11-7 16-16 16Z', 'M4 20c4-5 8-8 12-10']);
export const Target = make(['M12 2v3M12 19v3M2 12h3M19 12h3'], {
  circles: [
    [12, 12, 7],
    [12, 12, 2],
  ],
});
export const Grid = make(['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z']);
export const User = make(['M20 21a8 8 0 0 0-16 0'], { circles: [[12, 8, 4]] });
export const Bell = make([
  'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9',
  'M10.3 21a1.9 1.9 0 0 0 3.4 0',
]);
export const Pin = make(['M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z'], {
  circles: [[12, 10, 2.5]],
});
export const Mic = make([
  'M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z',
  'M19 11a7 7 0 0 1-14 0',
  'M12 18v4',
]);
export const Plus = make(['M12 5v14M5 12h14']);
export const Minus = make(['M5 12h14']);
export const Heart = make([
  'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z',
]);
export const Star = make([
  'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z',
]);
export const Clock = make(['M12 7v5l3 2'], { circles: [[12, 12, 9]] });
export const Scale = make([
  'M12 3v18M7 21h10M5 7h14',
  'M5 7l-3 7a3 3 0 0 0 6 0L5 7Z',
  'M19 7l-3 7a3 3 0 0 0 6 0l-3-7Z',
]);
export const Tag = make(
  ['M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8Z'],
  {
    circles: [[7, 7, 1.5]],
  },
);
/** The bonus coin: a ring with an open "c" — reads as currency at 12 px. */
export const Coin = make(['M14.4 9.7a3.2 3.2 0 1 0 0 4.6'], { circles: [[12, 12, 9]] });
export const Gift = make([
  'M20 12v9H4v-9',
  'M2 7h20v5H2z',
  'M12 22V7',
  'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z',
  'M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z',
]);
export const Wallet = make(['M21 12V7H5a2 2 0 0 1 0-4h14v4', 'M3 5v14a2 2 0 0 0 2 2h16v-5'], {
  circles: [[16, 14.5, 1.2]],
});
export const Share = make([
  'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7',
  'M16 6l-4-4-4 4',
  'M12 2v13',
]);
export const Trash = make(['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6M14 11v6']);
export const Edit = make(['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z']);
