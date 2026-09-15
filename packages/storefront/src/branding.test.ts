import { describe, expect, it } from 'vitest';

import { brandScale, brandingCss, hexToRgb } from './branding.js';

describe('branding', () => {
  it('derives a scale from one hex and keeps 500 as given', () => {
    const scale = brandScale('#14A899')!;
    expect(scale['500']).toBe('20 168 153');
    expect(scale['50']).toBe('236 248 247');
    expect(hexToRgb('nope')).toBeNull();
  });

  it('emits CSS variables only for colours the tenant set', () => {
    expect(brandingCss(null)).toBe('');
    expect(
      brandingCss({ appName: 'x', city: null, logoUrl: null, primary: '#336699', accent: null }),
    ).toMatch(/^:root\{--brand-50:.*--brand-950:[0-9 ]+\}$/);
  });
});
