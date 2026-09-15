/** Endpoint functions for /payments — starting an online checkout and reading it back. */
import type { PaymentDto } from '@bazar/types';

import type { Http } from '../client.js';

export const paymentsApi = (http: Http) => ({
  /**
   * Opens (or returns the live) payment for an order — or for one of the
   * platform's own products by `subject`; online ones carry `confirmationUrl`.
   */
  create: (body: {
    orderId?: string;
    subject?: string;
    method: PaymentDto['method'];
    returnUrl?: string;
    provider?: 'payme' | 'click' | 'uzum';
  }) => http.request<PaymentDto>('POST', '/payments', { body }),
  /** A month of Bazar Plus, keyed by the day so a retry reuses the same charge. */
  buyPlus: (
    customerId: string,
    body: { method: PaymentDto['method']; returnUrl?: string; provider?: 'payme' | 'click' },
  ) =>
    http.request<PaymentDto>('POST', '/payments', {
      body: { subject: `plus:${customerId}:${new Date().toISOString().slice(0, 10)}`, ...body },
    }),
  /** A week of paid placement for a store, keyed by the day so a retry reuses the charge. */
  promote: (
    storeId: string,
    body: { method: PaymentDto['method']; returnUrl?: string; provider?: 'payme' | 'click' },
  ) =>
    http.request<PaymentDto>('POST', '/payments', {
      body: { subject: `promo:${storeId}:${new Date().toISOString().slice(0, 10)}`, ...body },
    }),
  balance: () =>
    http.request<{ amount: number; currency: string }>('GET', '/payments/wallet/balance'),
  forOrder: (orderId: string) =>
    http.paginated<PaymentDto>('/payments', { orderId, pageSize: 10 }).then((page) => page.items),
  get: (id: string) => http.request<PaymentDto>('GET', `/payments/${id}`),
});
