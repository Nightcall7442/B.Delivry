import { describe, expect, it } from 'vitest';

import { activeHoliday, bundlesFor, holidayDaysLeft } from './holidays.js';

const at = (iso: string) => new Date(`${iso}T09:00:00+05:00`);

describe('activeHoliday', () => {
  it('opens the window on Tashkent dates and prefers the holiday ending first', () => {
    expect(activeHoliday(at('2026-03-01'))?.key).toBe('ramadan');
    expect(activeHoliday(at('2026-03-15'))?.key).toBe('ramadan');
    expect(activeHoliday(at('2026-03-21'))?.key).toBe('navruz');
    expect(activeHoliday(at('2026-05-27'))?.key).toBe('kurban');
    expect(activeHoliday(at('2026-09-12'))).toBeNull();
    // 23:30 UTC on the 21st is already the 22nd in Tashkent.
    expect(activeHoliday(new Date('2026-03-21T23:30:00Z'))).toBeNull();
  });

  it('counts the days left and puts the set first in the rail', () => {
    const navruz = activeHoliday(at('2026-03-21'))!;
    expect(holidayDaysLeft(navruz, at('2026-03-19'))).toBe(2);
    expect(bundlesFor(at('2026-03-21'))[0]?.slug).toBe('navruz');
    expect(bundlesFor(at('2026-09-12'))[0]?.slug).toBe('plov');
  });
});
