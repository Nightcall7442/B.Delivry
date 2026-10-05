/** Endpoint functions for /vendors — «Стать продавцом» and the desk's answer. */
import type {
  CreateVendorDto,
  VendorApplicationDto,
  VendorDto,
  VendorListQuery,
  VendorPayoutDto,
  VendorRowDto,
  VendorStatus,
} from '@bazar/types';

import type { Http } from '../client.js';
import type { PageQuery } from './page.js';

export const vendorsApi = (http: Http) => ({
  /** Applies for the signed-in user; the stalls stay invisible until the desk approves. */
  apply: (body: CreateVendorDto) => http.request<VendorDto>('POST', '/vendors', { body }),
  /** The caller's own application in any state; null = never applied. */
  application: () => http.request<VendorApplicationDto | null>('GET', '/vendors/me/application'),
  /** The signed-in vendor's own payout: available now and on hold until complaints are out of time. */
  payout: () => http.request<VendorPayoutDto>('GET', '/vendors/me/payout'),
  /** Desk: the applications and the vendors, filtered by status. */
  list: (query: VendorListQuery & PageQuery = {}) =>
    http.paginated<VendorRowDto>('/vendors', { ...query }),
  /** Desk: approve (ACTIVE — the VENDOR role comes with it), reject, suspend. */
  setStatus: (id: string, status: VendorStatus) =>
    http.request<void>('PUT', `/vendors/${id}/status`, { body: { status } }),
});
