/** Endpoint functions for /analytics — the vendor's revenue, the desk's dashboard, demand. */
import type { AnalyticsQuery, DemandReportDto, SalesReportDto } from '@bazar/types';

import type { Http } from '../client.js';

export const analyticsApi = (http: Http) => ({
  sales: (query: AnalyticsQuery = {}) =>
    http.request<SalesReportDto>('GET', '/admin/analytics/sales', { query: { ...query } }),
  /** What people searched for and what the catalogue could not answer. */
  demand: (query: { days?: number; storeId?: string } = {}) =>
    http.request<DemandReportDto>('GET', '/admin/analytics/demand', { query: { ...query } }),
  /** The shopping-list parser reports a line it could not match. */
  recordDemand: (body: { query: string; results: number; source: 'search' | 'list' }) =>
    http.request<void>('POST', '/analytics/demand', { body }),
});
