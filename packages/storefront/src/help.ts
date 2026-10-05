/**
 * «Гарантии и вопросы» — the promises, when money comes back, and the questions people ask, on one
 * page (Bazara keeps a FAQ and a returns policy side by side; ours were spread over «Гарантии», the
 * offer and hints at checkout). Every figure comes from the constants the API enforces, so the
 * page cannot promise what the code does not do.
 */
import { CASHBACK, GUARANTEE, HAGGLE, SALE } from '@bazar/constants';
import type { MessageKey } from '@bazar/i18n';

export interface HelpEntry {
  id: string;
  title: MessageKey;
  body: MessageKey;
  params?: Record<string, number>;
}

/** The two public promises. */
export const GUARANTEES: readonly HelpEntry[] = [
  {
    id: 'freshness',
    title: 'rules.freshness.title',
    body: 'rules.freshness.body',
    params: { hours: GUARANTEE.FRESHNESS_WINDOW_HOURS },
  },
  {
    id: 'late',
    title: 'rules.late.title',
    body: 'rules.late.body',
    params: { minutes: GUARANTEE.LATE_TOLERANCE_MINUTES },
  },
];

/** When money comes back, besides the promises. */
export const RETURNS: readonly HelpEntry[] = [
  { id: 'missing', title: 'help.missing.title', body: 'help.missing.body' },
  { id: 'weight', title: 'help.weight.title', body: 'help.weight.body' },
  { id: 'cancel', title: 'help.cancel.title', body: 'help.cancel.body' },
];

export const FAQ: readonly HelpEntry[] = [
  { id: 'estimate', title: 'help.estimate.title', body: 'help.estimate.body' },
  { id: 'stalls', title: 'help.stalls.title', body: 'help.stalls.body' },
  {
    id: 'sale',
    title: 'help.sale.title',
    body: 'help.sale.body',
    params: { days: SALE.REFERENCE_DAYS },
  },
  {
    id: 'haggle',
    title: 'help.haggle.title',
    body: 'help.haggle.body',
    params: { hours: HAGGLE.ASK_TTL_HOURS, holds: HAGGLE.PRICE_TTL_HOURS },
  },
  { id: 'wish', title: 'help.wish.title', body: 'help.wish.body' },
  { id: 'payment', title: 'help.payment.title', body: 'help.payment.body' },
  {
    id: 'cashback',
    title: 'help.cashback.title',
    body: 'help.cashback.body',
    params: { percent: CASHBACK.PERCENT, days: CASHBACK.EXPIRES_DAYS },
  },
  { id: 'hearts', title: 'help.hearts.title', body: 'help.hearts.body' },
];
