/**
 * White-label colours: a tenant names one primary and one accent hex; the
 * apps need the whole scale (50…950) the design tokens are written against.
 * Lighter steps mix towards white, darker ones towards a deep version of the
 * hue, at ratios that reproduce the default cobalt scale from #3B6BE3.
 * ponytail: a linear mix in sRGB — fine for a wordmark and buttons; move to
 * OKLCH when somebody complains about a muddy 300.
 */
import type { TenantBrandingDto } from '@bazar/types';

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const value = parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const mix = (from: Rgb, to: Rgb, amount: number): Rgb =>
  from.map((channel, i) => Math.round(channel + (to[i]! - channel) * amount)) as Rgb;

const WHITE: Rgb = [255, 255, 255];
const DEEP: Rgb = [4, 43, 41];

/** Step → how far from the base colour: negative towards white, positive towards deep. */
const STEPS: Record<string, number> = {
  '50': -0.92,
  '100': -0.82,
  '200': -0.64,
  '300': -0.42,
  '400': -0.18,
  '500': 0,
  '600': 0.2,
  '700': 0.36,
  '800': 0.5,
  '900': 0.62,
  '950': 0.95,
};

/** "r g b" triplets per step, the form Tailwind's `rgb(var(--x) / <alpha>)` wants. */
export function brandScale(hex: string): Record<string, string> | null {
  const base = hexToRgb(hex);
  if (base === null) return null;
  const deep = mix(DEEP, base, 0.15);
  return Object.fromEntries(
    Object.entries(STEPS).map(([step, amount]) => [
      step,
      (amount < 0 ? mix(base, WHITE, -amount) : mix(base, deep, amount)).join(' '),
    ]),
  );
}

const ACCENT_STEPS: Record<string, number> = {
  '100': -0.85,
  '300': -0.5,
  '400': -0.2,
  '500': 0,
  '600': 0.25,
  '900': 0.72,
};

export function accentScale(hex: string): Record<string, string> | null {
  const base = hexToRgb(hex);
  if (base === null) return null;
  const deep: Rgb = [40, 24, 4];
  return Object.fromEntries(
    Object.entries(ACCENT_STEPS).map(([step, amount]) => [
      step,
      (amount < 0 ? mix(base, WHITE, -amount) : mix(base, deep, amount)).join(' '),
    ]),
  );
}

/** The `:root { --brand-500: … }` block for a tenant; empty when it keeps the defaults. */
export function brandingCss(branding: TenantBrandingDto | null): string {
  const lines: string[] = [];
  const brand = branding?.primary ? brandScale(branding.primary) : null;
  const accent = branding?.accent ? accentScale(branding.accent) : null;
  for (const [step, rgb] of Object.entries(brand ?? {})) lines.push(`--brand-${step}:${rgb}`);
  for (const [step, rgb] of Object.entries(accent ?? {})) lines.push(`--saffron-${step}:${rgb}`);
  return lines.length === 0 ? '' : `:root{${lines.join(';')}}`;
}
