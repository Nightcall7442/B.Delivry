/** Endpoint functions for /couriers — the courier's own account. */
import type { CourierDto, CourierListQuery, CourierShiftDto } from '@bazar/types';

import type { Http } from '../client.js';

export const couriersApi = (http: Http) => ({
  /** Staff only: everyone on the roster, with status and last fix. */
  list: (query: CourierListQuery & { page?: number; pageSize?: number } = {}) =>
    http.paginated<CourierDto>('/couriers', { ...query }),
  me: () => http.request<CourierDto>('GET', '/couriers/me'),
  shift: () => http.request<CourierShiftDto>('GET', '/couriers/me/shift'),
  setStatus: (status: 'ONLINE' | 'OFFLINE' | 'BUSY') =>
    http.request<CourierDto>('PUT', '/couriers/me/status', { body: { status } }),
  /** "Стать курьером махалли": a customer volunteers, home = the given address. */
  apply: (addressId: string) =>
    http.request<CourierDto>('POST', '/couriers/apply', { body: { addressId } }),
  /** Staff: the account may go online. */
  verify: (id: string) => http.request<CourierDto>('POST', `/couriers/${id}/verify`),
});
