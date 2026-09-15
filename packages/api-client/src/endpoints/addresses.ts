/** Endpoint functions for /addresses. */
import type { AddressDto, CreateAddressDto, UpdateAddressDto } from '@bazar/types';

import type { Http } from '../client.js';

export const addressesApi = (http: Http) => ({
  list: () => http.request<AddressDto[]>('GET', '/customers/me/addresses'),
  get: (id: string) => http.request<AddressDto>('GET', `/customers/me/addresses/${id}`),
  create: (body: CreateAddressDto) =>
    http.request<AddressDto>('POST', '/customers/me/addresses', { body }),
  update: (id: string, body: UpdateAddressDto) =>
    http.request<AddressDto>('PATCH', `/customers/me/addresses/${id}`, { body }),
  setDefault: (id: string) =>
    http.request<AddressDto>('POST', `/customers/me/addresses/${id}/default`),
  remove: (id: string) => http.request<void>('DELETE', `/customers/me/addresses/${id}`),
  deliverable: (id: string) =>
    http.request<{ deliverable: boolean; reason: string | null }>(
      'GET',
      `/customers/me/addresses/${id}/deliverable`,
    ),
});
