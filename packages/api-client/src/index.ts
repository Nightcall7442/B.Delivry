/**
 * API client barrel: createApiClient(config).
 *
 * One object per app, built once with the app's token store; every screen
 * calls `api.stores.list()` and never sees a URL, a header or the envelope.
 */
import { Http } from './client.js';
import {
  addressesApi,
  analyticsApi,
  authApi,
  cartApi,
  catalogApi,
  couriersApi,
  customersApi,
  deliveryApi,
  favoritesApi,
  geoApi,
  haggleApi,
  looksApi,
  regularsApi,
  ordersApi,
  notificationsApi,
  paymentsApi,
  reviewsApi,
  subscriptionsApi,
  supportApi,
  storesApi,
  trackingApi,
  tenantsApi,
  uploadsApi,
  vendorsApi,
} from './endpoints/index.js';
import type { ApiClientOptions } from './types.js';
import { RealtimeClient } from './ws.js';

export function createApiClient(options: ApiClientOptions) {
  const http = new Http(options);
  return {
    http,
    auth: authApi(http, options.tokens),
    customers: customersApi(http),
    favorites: favoritesApi(http),
    addresses: addressesApi(http),
    analytics: analyticsApi(http),
    stores: storesApi(http),
    catalog: catalogApi(http),
    cart: cartApi(http),
    orders: ordersApi(http),
    notifications: notificationsApi(http),
    payments: paymentsApi(http),
    reviews: reviewsApi(http),
    subscriptions: subscriptionsApi(http),
    support: supportApi(http),
    tracking: trackingApi(http),
    tenants: tenantsApi(http),
    uploads: uploadsApi(http),
    vendors: vendorsApi(http),
    couriers: couriersApi(http),
    delivery: deliveryApi(http),
    geo: geoApi(http),
    haggle: haggleApi(http),
    looks: looksApi(http),
    regulars: regularsApi(http),
    /** ws://host/ws, derived from the HTTP base so one env var configures both. */
    realtime: new RealtimeClient({
      url: options.baseUrl.replace(/^http/, 'ws').replace(/\/api\/v\d+\/?$/, '') + '/ws',
      tokens: options.tokens,
      renew: (stale) => http.renew(stale),
    }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export { Http } from './client.js';
export { ApiError, isApiError } from './errors.js';
export * from './types.js';
export { RealtimeClient, room } from './ws.js';
