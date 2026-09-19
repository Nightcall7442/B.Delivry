/** Endpoint functions for /stores. */
import type { StoreDto, StoreListQuery, UpdateStoreDto } from '@bazar/types';

import type { Http } from '../client.js';
import type { PageQuery } from './page.js';

export const storesApi = (http: Http) => ({
  list: (query: StoreListQuery & PageQuery = {}) =>
    http.paginated<StoreDto>('/stores', { ...query }),
  get: (id: string) => http.request<StoreDto>('GET', `/stores/${id}`),
  update: (id: string, body: UpdateStoreDto) =>
    http.request<StoreDto>('PATCH', `/stores/${id}`, { body }),
  /** Vendor's own stalls (the API scopes by the signed-in vendor). */
  mine: () =>
    http.paginated<StoreDto>('/stores', { pageSize: 50, mine: true }).then((p) => p.items),
  /** Vendor/staff: "these arrived today", optionally told to the season's customers. */
  /** Shop cabinet: the whole shelf from one spreadsheet (see products.service importCsv). */
  importProducts: (id: string, csv: string) =>
    http.request<{ created: number; updated: number; skipped: string[] }>(
      'POST',
      `/stores/${id}/products/import`,
      { body: { csv } },
    ),
  /** Shop cabinet: delivered orders of the period as a CSV the accountant opens in Excel. */
  report: (id: string, query: { from?: string; to?: string } = {}) =>
    http.request<{ filename: string; csv: string }>('GET', `/stores/${id}/report`, { query }),
  markArrivals: (
    id: string,
    body: { productIds: string[]; announce: boolean; photoUrl?: string },
  ) =>
    http.request<{ marked: number; notified: number }>('POST', `/stores/${id}/arrivals`, { body }),
});
