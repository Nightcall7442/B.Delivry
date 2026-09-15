/** Endpoint functions for the tenant: the brand a host shows, and editing it. */
import type { PublicTenantDto, TenantDto, UpdateTenantBrandingDto } from '@bazar/types';

import type { Http } from '../client.js';

export const tenantsApi = (http: Http) => ({
  /** Public: the brand behind `host` (the browser's host), the default tenant otherwise. */
  current: (host?: string) =>
    http.request<PublicTenantDto>('GET', '/tenants/current', {
      query: host ? { host } : {},
    }),
  /** Admin: the tenant row with its branding. */
  get: () => http.request<TenantDto>('GET', '/admin/tenant'),
  updateBranding: (body: UpdateTenantBrandingDto) =>
    http.request<TenantDto>('PATCH', '/admin/tenant/branding', { body }),
});
