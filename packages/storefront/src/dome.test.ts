import { describe, expect, it } from 'vitest';

import { alpha, channels, girih, girihSvg, hallLight } from './dome.js';

type Point = [number, number];
const polygons = (d: string): Point[][] =>
  d
    .split('M')
    .filter(Boolean)
    .map((part) =>
      part
        .replace('Z', '')
        .split('L')
        .map((xy) => xy.split(' ').map(Number) as Point),
    );
const centre = (points: Point[]): Point => [
  points.reduce((sum, [x]) => sum + x, 0) / points.length,
  points.reduce((sum, [, y]) => sum + y, 0) / points.length,
];

describe('girih', () => {
  it('draws the same tile for the same seed on every device', () => {
    expect(girih({ seed: 7 })).toEqual(girih({ seed: 7 }));
    expect(girih({ seed: 7 }).lines).not.toBe(girih({ seed: 8 }).lines);
  });

  it('joins without a seam: the star past the left edge is the last column moved one tile', () => {
    const { lines, size } = girih({ cells: 6, cell: 40 });
    const stars = polygons(lines).filter((points) => points.length === 16);
    const spill = stars.filter((points) => centre(points)[0] < 0);
    expect(spill.length).toBeGreaterThan(0);
    for (const star of spill) {
      const twin = stars.find((other) =>
        other.every(([x, y], k) => Math.abs(x - star[k]![0] - size) < 0.11 && y === star[k]![1]),
      );
      expect(twin).toBeDefined();
    }
  });

  it('glazes some stars and leaves most of the dome bare', () => {
    const tile = girih();
    const glazed = Object.values(tile.glaze).reduce((n, d) => n + polygons(d).length, 0);
    expect(glazed).toBeGreaterThan(0);
    expect(glazed).toBeLessThan(14 * 14);
  });

  it('serves a standalone svg tile', () => {
    const svg = girihSvg('evening');
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="672"')).toBe(true);
    expect(svg).toContain('stroke="#A9BCDF"');
  });
});

describe('the hall clock and colour helpers', () => {
  it('lights the lamps from five to five, Tashkent time', () => {
    expect(hallLight(16)).toBe('morning');
    expect(hallLight(17)).toBe('evening');
    expect(hallLight(4)).toBe('evening');
    expect(hallLight(5)).toBe('morning');
  });

  it('turns a hex into channels and rgba', () => {
    expect(channels('#9E2A2B')).toBe('158 42 43');
    expect(alpha('#101524', 0.5)).toBe('rgba(16,21,36,0.5)');
  });
});
