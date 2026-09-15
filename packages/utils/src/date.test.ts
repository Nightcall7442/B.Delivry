import { describe, expect, it } from 'vitest';

import { nextLocalOccurrence } from './date.js';

// Saturday 2026-09-12 07:30 Tashkent = 02:30 UTC.
const from = new Date('2026-09-12T02:30:00Z');

describe('nextLocalOccurrence', () => {
  it('lands on the coming slot the same day when it has not started', () => {
    expect(nextLocalOccurrence(6, 8, from).toISOString()).toBe('2026-09-12T03:00:00.000Z');
  });

  it('skips a week once the slot hour has passed', () => {
    expect(nextLocalOccurrence(6, 8, new Date('2026-09-12T03:00:00Z')).toISOString()).toBe(
      '2026-09-19T03:00:00.000Z',
    );
  });

  it('counts forward to another weekday', () => {
    // Monday 18:00 Tashkent = 13:00 UTC.
    expect(nextLocalOccurrence(1, 18, from).toISOString()).toBe('2026-09-14T13:00:00.000Z');
  });
});
