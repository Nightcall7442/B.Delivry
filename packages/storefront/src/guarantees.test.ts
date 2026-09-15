import { describe, expect, it } from 'vitest';

import { freshnessOpen, lateMinutes, lateRefundDue } from './guarantees.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 12, 10, minutes)).toISOString();

describe('guarantees', () => {
  it('measures lateness only when both times are known', () => {
    expect(lateMinutes({ promisedAt: at(0), deliveredAt: at(25) })).toBe(25);
    expect(lateMinutes({ promisedAt: at(30), deliveredAt: at(25) })).toBe(0);
    expect(lateMinutes({ promisedAt: null, deliveredAt: at(25) })).toBe(0);
  });

  it('refunds past the tolerance, not at it', () => {
    expect(lateRefundDue({ promisedAt: at(0), deliveredAt: at(20) })).toBe(false);
    expect(lateRefundDue({ promisedAt: at(0), deliveredAt: at(21) })).toBe(true);
  });

  it('keeps the freshness window open for two hours after the door', () => {
    const order = { promisedAt: null, deliveredAt: at(0) };
    expect(freshnessOpen(order, new Date(at(119)))).toBe(true);
    expect(freshnessOpen(order, new Date(at(121)))).toBe(false);
    expect(freshnessOpen({ promisedAt: null, deliveredAt: null })).toBe(false);
  });
});
