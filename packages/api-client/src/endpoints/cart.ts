/** Endpoint functions for /cart: one server cart per store, like the client-side one. */
import type { AddCartItemDto, CartDto, UpdateCartItemDto } from '@bazar/types';

import type { Http } from '../client.js';

export const cartApi = (http: Http) => ({
  list: () => http.request<CartDto[]>('GET', '/cart'),
  get: (storeId: string) => http.request<CartDto>('GET', `/cart/${storeId}`),
  addItem: (body: AddCartItemDto) => http.request<CartDto>('POST', '/cart/items', { body }),
  updateItem: (storeId: string, itemId: string, body: UpdateCartItemDto) =>
    http.request<CartDto>('PATCH', `/cart/${storeId}/items/${itemId}`, { body }),
  removeItem: (storeId: string, itemId: string) =>
    http.request<CartDto>('DELETE', `/cart/${storeId}/items/${itemId}`),
  clear: (storeId: string) => http.request<void>('DELETE', `/cart/${storeId}`),
});
