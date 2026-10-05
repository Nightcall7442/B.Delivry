import { CASHBACK, GUARANTEE, HAGGLE, SALE } from '@bazar/constants';
import { createT } from '@bazar/i18n';
import { describe, expect, it } from 'vitest';
import { FAQ, GUARANTEES, RETURNS } from './help.js';

const ALL = [...GUARANTEES, ...RETURNS, ...FAQ];

describe('«Гарантии и вопросы»', () => {
  it.each(['ru', 'uz'])(
    'reads whole in %s: every entry written, every figure filled in',
    (locale) => {
      const t = createT(locale);
      for (const entry of ALL) {
        for (const text of [t(entry.title), t(entry.body, entry.params)]) {
          expect(text).not.toMatch(/^(help|rules)\./);
          expect(text).not.toMatch(/[{}]/);
        }
      }
    },
  );

  it('promises what the code enforces', () => {
    const t = createT('ru');
    const body = (id: string) => {
      const entry = ALL.find((candidate) => candidate.id === id);
      return entry === undefined ? '' : t(entry.body, entry.params);
    };
    expect(body('freshness')).toContain(`${GUARANTEE.FRESHNESS_WINDOW_HOURS} час`);
    expect(body('late')).toContain(`${GUARANTEE.LATE_TOLERANCE_MINUTES} минут`);
    expect(body('sale')).toContain(`${SALE.REFERENCE_DAYS} дней`);
    expect(body('haggle')).toContain(`${HAGGLE.ASK_TTL_HOURS} ч`);
    expect(body('cashback')).toContain(`${CASHBACK.PERCENT} %`);
    expect(new Set(ALL.map((entry) => entry.id)).size).toBe(ALL.length);
  });
});
