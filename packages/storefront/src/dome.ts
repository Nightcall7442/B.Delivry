/**
 * «Свет купола» — the ground under every screen and the palette everything
 * else is taken from. The landing film opens under the Chorsu dome; the
 * product stands in the same hall: glazed girih overhead, light from the ring
 * of arched windows in the morning, a string of lamps over the rows at night.
 *
 * Six colours, all from the film. Every other colour in the product is one of
 * them lit, shaded or worn (`TONE`) — never a seventh.
 */

export const HALL = {
  /** Бирюза купола: the dome in shadow — the morning ground. */
  dome: '#123A3A',
  /** Лазурит: the same dome after the lamps are lit — the evening ground. */
  lapis: '#0E1A33',
  /** Охра изразца: the accent — eyebrows, rules, the chosen sign. */
  ochre: '#E39B2F',
  /** Гранат: the one colour that is a button. */
  pomegranate: '#9E2A2B',
  /** Крем бумаги: every sheet, slip and price sign. */
  cream: '#F4EFE4',
  /** Чернила: text on paper. */
  ink: '#2B1B0E',
} as const;

/** The six, lit, shaded or worn. Each names the colour it comes from. */
export const TONE = {
  /** dome, where the window light never reaches */
  domeDeep: '#0A2424',
  /** dome, near the windows */
  domeLit: '#1B4A48',
  /** lapis, under the rows at night */
  lapisDeep: '#070E1E',
  /** lapis, under the lamps */
  lapisLit: '#17264A',
  /** dome, glazed and lit: the turquoise of the tiles */
  turquoise: '#45B0A4',
  /** lapis, glazed and lit: the cobalt of the tiles */
  cobalt: '#3F6DB5',
  /** ochre, lifted for text on the ground */
  ochreLight: '#F2C56B',
  /** ochre, pressed */
  ochreDeep: '#C8851F',
  /** pomegranate, pressed */
  pomegranateDeep: '#7E1F21',
  /** pomegranate, lit: an error or a warning on the dark */
  pomegranateLit: '#D9767A',
  /** cream as text and discs on the ground */
  creamLight: '#FBF1DE',
  /** cream, second line on the ground */
  creamMuted: '#D9C7A6',
  /** cream toward ochre: kraft — tags, section boards */
  kraft: '#EAD8B2',
  /** cream, worn: the edge of paper, dashed rules */
  paperEdge: '#C9B99A',
  /** ink, second line on paper */
  inkSoft: '#6A5A44',
  /** lapis paint: the board over a shop's door */
  board: '#16213D',
} as const;

export type HallLight = 'morning' | 'evening';

/** Tashkent hour: the bazaar lives on its own clock, not the visitor's. */
export const tashkentHour = (now = new Date()): number => (now.getUTCHours() + 5) % 24;

/** The lamps are lit from five in the evening until five in the morning. */
export const isEvening = (hour = tashkentHour()): boolean => hour >= 17 || hour < 5;

export const hallLight = (hour = tashkentHour()): HallLight =>
  isEvening(hour) ? 'evening' : 'morning';

/** The ground at each light: top of the hall, the ground itself, the rows below, the tile line, the light. */
export const GROUND = {
  morning: {
    top: TONE.domeLit,
    base: HALL.dome,
    deep: TONE.domeDeep,
    line: '#CFEDE6',
    light: '#FFE2B0',
  },
  evening: {
    top: TONE.lapisLit,
    base: HALL.lapis,
    deep: TONE.lapisDeep,
    line: '#A9BCDF',
    light: '#FFB866',
  },
} as const satisfies Record<HallLight, Record<string, string>>;

/** `#RRGGBB` → `r g b`, the shape CSS colour channels and rgba() builders want. */
export function channels(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** `#RRGGBB` at an opacity, for the places that only take a colour string. */
export function alpha(hex: string, a: number): string {
  return `rgba(${channels(hex).split(' ').join(',')},${a})`;
}

// ---- the girih ----------------------------------------------------------------------------

export interface GirihOptions {
  /** Stars per tile edge; even, so the slow noise wraps with the tile. */
  cells?: number;
  /** One star's cell, px. */
  cell?: number;
  /** How far the master's hand moves a vertex, 0…1 of a tenth of a cell. */
  hand?: number;
  /** Share of glazed stars, 0…1. */
  glaze?: number;
  seed?: number;
}

export interface Girih {
  /** Tile edge, px: the pattern repeats seamlessly at this period. */
  size: number;
  /** Every line of the tile as one path. */
  lines: string;
  /** Glazed stars, one path per glaze. */
  glaze: { turquoise: string; cobalt: string; ochre: string };
}

/** Deterministic 0…1 stream (mulberry32). */
function stream(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise that repeats every `period` units in both axes. */
function wrappingNoise(seed: number, period: number): (x: number, y: number) => number {
  const next = stream(seed);
  const table = Array.from({ length: period * period }, next);
  const wrap = (i: number) => ((i % period) + period) % period;
  const at = (i: number, j: number) => table[wrap(j) * period + wrap(i)]!;
  const ease = (f: number) => f * f * (3 - 2 * f);
  return (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const sx = ease(x - i);
    const sy = ease(y - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * One tile of the dome's eight-fold girih: an octagram at every lattice node
 * (two squares, one turned by 45°), each ray stitched to the neighbour's, a
 * small cross where four stars meet, a rosette in every heart. Every vertex is
 * moved a little by slow noise — the master's hand; some stars keep only half
 * their outline (weathered); a second, slower noise decides the glaze.
 * Everything is a function of the cell modulo the tile, so tiles join without
 * a seam.
 */
export function girih({
  cells = 12,
  cell = 56,
  hand = 0.35,
  glaze = 0.42,
  seed = 1402,
}: GirihOptions = {}): Girih {
  if (cells % 2 !== 0) throw new Error('girih: cells must be even');
  const size = cells * cell;
  const period = cells / 2;
  const jitter = wrappingNoise(seed, period);
  const glazeField = wrappingNoise(seed + 7, period);
  const pickField = wrappingNoise(seed + 11, period);
  const wrap = (i: number) => ((i % cells) + cells) % cells;
  const weathered = (i: number, j: number) =>
    stream(seed ^ Math.imul(wrap(i) + 1, 374761393) ^ Math.imul(wrap(j) + 1, 668265263))() > 0.8;

  const outer = cell * 0.46;
  const inner = cell * 0.27;
  const heart = cell * 0.13;
  const reach = cell * 0.11 * hand;

  const vertex = (i: number, j: number, k: number): [number, number] => {
    const angle = (k * Math.PI) / 8;
    const radius =
      (k % 2 === 0 ? outer : inner) + (jitter(i * 0.5 + k * 0.7, j * 0.5) - 0.5) * 2 * reach;
    return [
      i * cell + cell / 2 + Math.cos(angle) * radius,
      j * cell + cell / 2 + Math.sin(angle) * radius,
    ];
  };
  const polygon = (points: [number, number][]) =>
    `M${points.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L')}Z`;
  const segment = (a: [number, number], b: [number, number]) =>
    `M${fmt(a[0])} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1])}`;

  const lines: string[] = [];
  const glazes = { turquoise: [] as string[], cobalt: [] as string[], ochre: [] as string[] };
  const cut = 1 - glaze * 0.92;

  // One ring past the edge on every side: what spills over is the neighbour tile's own star.
  for (let j = -1; j <= cells; j++) {
    for (let i = -1; i <= cells; i++) {
      const star = Array.from({ length: 16 }, (_, k) => vertex(i, j, k));

      if (glazeField(i * 0.5, j * 0.5) > cut) {
        const pick = pickField(i * 0.5 + 3.3, j * 0.5 + 1.7);
        glazes[pick < 0.5 ? 'turquoise' : pick < 0.68 ? 'cobalt' : 'ochre'].push(polygon(star));
      }

      if (weathered(i, j)) {
        for (let k = 0; k < 16; k += 2) lines.push(segment(star[k]!, star[k + 1]!));
      } else {
        lines.push(polygon(star));
      }

      const cx = i * cell + cell / 2;
      const cy = j * cell + cell / 2;
      lines.push(
        polygon(
          Array.from({ length: 8 }, (_, k): [number, number] => {
            const angle = (k * Math.PI) / 4 + Math.PI / 8;
            return [cx + Math.cos(angle) * heart, cy + Math.sin(angle) * heart];
          }),
        ),
      );

      // Rays stitched to the neighbours right and below, the cross between four stars.
      lines.push(segment(star[0]!, vertex(i + 1, j, 8)));
      lines.push(segment(star[4]!, vertex(i, j + 1, 12)));
      const qx = cx + cell / 2;
      const qy = cy + cell / 2;
      const q = cell * 0.13;
      lines.push(
        polygon([
          [qx, qy - q],
          [qx + q, qy],
          [qx, qy + q],
          [qx - q, qy],
        ]),
      );
    }
  }

  return {
    size,
    lines: lines.join(''),
    glaze: {
      turquoise: glazes.turquoise.join(''),
      cobalt: glazes.cobalt.join(''),
      ochre: glazes.ochre.join(''),
    },
  };
}

/** How the tile is painted at each light: line and glaze opacities, glaze colours. */
export const GIRIH_PAINT = {
  morning: {
    line: GROUND.morning.line,
    lineOpacity: 0.2,
    glazeOpacity: 0.16,
    turquoise: TONE.turquoise,
    cobalt: TONE.cobalt,
    ochre: HALL.ochre,
  },
  evening: {
    line: GROUND.evening.line,
    lineOpacity: 0.15,
    glazeOpacity: 0.12,
    turquoise: '#3C8F97',
    cobalt: TONE.cobalt,
    ochre: '#B77A2A',
  },
} as const satisfies Record<HallLight, Record<string, string | number>>;

/** The tile as a standalone SVG document (the web serves it as a cached background image). */
export function girihSvg(light: HallLight, options?: GirihOptions): string {
  const tile = girih(options);
  const paint = GIRIH_PAINT[light];
  const fills = (['turquoise', 'cobalt', 'ochre'] as const)
    .filter((key) => tile.glaze[key])
    .map(
      (key) =>
        `<path d="${tile.glaze[key]}" fill="${paint[key]}" fill-opacity="${paint.glazeOpacity}"/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile.size}" height="${tile.size}" viewBox="0 0 ${tile.size} ${tile.size}">` +
    fills +
    `<path d="${tile.lines}" fill="none" stroke="${paint.line}" stroke-opacity="${paint.lineOpacity}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</svg>`
  );
}
