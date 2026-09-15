/** Endpoint functions for /delivery — the courier driving a trip forward. */
import type {
  AcceptDeliveryDto,
  CompleteDeliveryDto,
  DeliveryDto,
  DeliveryListQuery,
  FailDeliveryDto,
} from '@bazar/types';

import type { Http } from '../client.js';
import type { Paginated } from '../types.js';

export const deliveryApi = (http: Http) => ({
  list: (query: DeliveryListQuery & { page?: number; pageSize?: number } = {}) =>
    http.paginated<DeliveryDto>('/delivery', { ...query }),
  active: () => http.request<DeliveryDto[]>('GET', '/delivery/active'),
  get: (id: string) => http.request<DeliveryDto>('GET', `/delivery/${id}`),
  accept: (id: string, body: AcceptDeliveryDto = {}) =>
    http.request<DeliveryDto>('POST', `/delivery/${id}/accept`, { body }),
  decline: (id: string) => http.request<void>('POST', `/delivery/${id}/decline`),
  arrivedPickup: (id: string) =>
    http.request<DeliveryDto>('POST', `/delivery/${id}/arrived-pickup`),
  pickedUp: (id: string) => http.request<DeliveryDto>('POST', `/delivery/${id}/picked-up`),
  arrivedDropoff: (id: string) =>
    http.request<DeliveryDto>('POST', `/delivery/${id}/arrived-dropoff`),
  complete: (id: string, body: CompleteDeliveryDto = {}) =>
    http.request<DeliveryDto>('POST', `/delivery/${id}/complete`, { body }),
  fail: (id: string, body: FailDeliveryDto) =>
    http.request<DeliveryDto>('POST', `/delivery/${id}/fail`, { body }),
  /** Dispatcher overrides. */
  assign: (id: string, courierId: string) =>
    http.request<DeliveryDto>('POST', `/delivery/${id}/assign`, { body: { courierId } }),
  restartSearch: (id: string) => http.request<void>('POST', `/delivery/${id}/search`),
  release: (id: string, reason: string) =>
    http.request<void>('POST', `/delivery/${id}/release`, { body: { reason } }),
});

export type DeliveryPage = Paginated<DeliveryDto>;
