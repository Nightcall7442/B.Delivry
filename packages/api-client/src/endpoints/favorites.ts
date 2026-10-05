/** Endpoint functions for /customers/me/favorites — the hearts on goods and stalls. */
import type { FavoritesDto } from '@bazar/types';

import type { Http } from '../client.js';

const base = '/customers/me/favorites';

export const favoritesApi = (http: Http) => ({
  list: () => http.request<FavoritesDto>('GET', base),
  /** Idempotent both ways: a double tap lands where it meant to. */
  saveProduct: (productId: string) => http.request<void>('PUT', `${base}/products/${productId}`),
  forgetProduct: (productId: string) =>
    http.request<void>('DELETE', `${base}/products/${productId}`),
  saveStore: (storeId: string) => http.request<void>('PUT', `${base}/stores/${storeId}`),
  forgetStore: (storeId: string) => http.request<void>('DELETE', `${base}/stores/${storeId}`),
});
