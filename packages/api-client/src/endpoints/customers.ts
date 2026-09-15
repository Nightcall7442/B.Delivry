/** Endpoint functions for /customers and /users — the signed-in person. */
import type {
  ApplyBusinessDto,
  CurrentUserDto,
  CustomerDto,
  CustomerListQuery,
  SetBusinessDto,
  UpdateCustomerDto,
  UpdateProfileDto,
} from '@bazar/types';

import type { Http } from '../client.js';

export const customersApi = (http: Http) => ({
  me: () => http.request<CustomerDto>('GET', '/customers/me'),
  update: (body: UpdateCustomerDto) =>
    http.request<CustomerDto>('PATCH', '/customers/me', { body }),
  user: () => http.request<CurrentUserDto>('GET', '/users/me'),
  /** My referral code (minted on first ask). */
  referral: () => http.request<{ code: string }>('GET', '/customers/me/referral'),
  /** "I have a friend's code" — only before the first order. */
  applyReferral: (code: string) =>
    http.request<void>('POST', '/customers/me/referral', { body: { code } }),
  /** B2B: "we are a café" — the company for invoices; an operator grants credit. */
  applyBusiness: (body: ApplyBusinessDto) =>
    http.request<CustomerDto>('POST', '/customers/me/business', { body }),
  /** Operator: approve a company and set its credit. */
  setBusiness: (customerId: string, body: SetBusinessDto) =>
    http.request<CustomerDto>('PATCH', `/customers/${customerId}/business`, { body }),
  list: (query: CustomerListQuery & { page?: number; pageSize?: number } = {}) =>
    http.paginated<CustomerDto>('/customers', { ...query }),
  updateUser: (body: UpdateProfileDto) =>
    http.request<CurrentUserDto>('PATCH', '/users/me', { body }),
});
