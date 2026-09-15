import { describe, expect, it } from 'vitest';

import { currentSeason } from './seasons.js';

describe('currentSeason', () => {
  it('picks the month and wraps the winter range past December', () => {
    expect(currentSeason(new Date('2026-08-15')).key).toBe('melon');
    expect(currentSeason(new Date('2026-10-01')).key).toBe('pomegranate');
    expect(currentSeason(new Date('2026-12-20')).key).toBe('dried');
    expect(currentSeason(new Date('2027-01-05')).key).toBe('dried');
    expect(currentSeason(new Date('2027-03-01')).key).toBe('greens');
  });
});
