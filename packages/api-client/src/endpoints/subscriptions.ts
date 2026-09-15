/** Endpoint functions for /subscriptions — "this basket, every week". */
import type {
  CartSubscriptionDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from '@bazar/types';

import type { Http } from '../client.js';

export const subscriptionsApi = (http: Http) => ({
  list: () => http.request<CartSubscriptionDto[]>('GET', '/subscriptions'),
  create: (body: CreateSubscriptionDto) =>
    http.request<CartSubscriptionDto>('POST', '/subscriptions', { body }),
  update: (id: string, body: UpdateSubscriptionDto) =>
    http.request<CartSubscriptionDto>('PATCH', `/subscriptions/${id}`, { body }),
  remove: (id: string) => http.request<void>('DELETE', `/subscriptions/${id}`),
});
