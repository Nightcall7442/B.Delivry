/** Endpoint functions for the tenant: the brand a host shows, its settings, and editing them. */
import type {
  PublicTenantDto,
  TenantDto,
  TenantSettingsDto,
  UpdateTenantBrandingDto,
  UpdateTenantSettingsDto,
} from '@bazar/types';

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
  /** Admin: the switches of the order flow (auto-confirm, auto-assign, ...). */
  settings: () => http.request<TenantSettingsDto>('GET', '/admin/settings'),
  updateSettings: (body: UpdateTenantSettingsDto) =>
    http.request<TenantSettingsDto>('PATCH', '/admin/settings', { body }),
});
