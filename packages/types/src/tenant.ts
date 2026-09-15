/**
 * tenant types / DTOs.
 */
import type { Currency, Locale } from '@bazar/constants';
import type { Entity, Id } from './common.js';

/**
 * One tenant per operating brand/region. Every tenant-scoped row carries
 * `tenantId`, and every request resolves exactly one tenant before it reaches
 * a repository.
 */
export interface TenantDto extends Entity {
  slug: string;
  name: string;
  /** Custom domain, when the tenant runs its own storefront. */
  domain: string | null;
  defaultLocale: Locale;
  supportedLocales: Locale[];
  currency: Currency;
  timezone: string;
  supportPhone: string | null;
  active: boolean;
  branding: TenantBrandingDto | null;
}

/** White-label: what makes another city's bazaar app look like its own. */
export interface TenantBrandingDto {
  /** The wordmark and the app name: "bazar", "Samarqand Bozor". */
  appName: string;
  /** City shown next to the wordmark. */
  city: string | null;
  logoUrl: string | null;
  /** Hex colours; the scales are derived from them on the client. */
  primary: string | null;
  accent: string | null;
}

/** What any client may read before signing in: the brand of the host it opened. */
export interface PublicTenantDto {
  slug: string;
  name: string;
  defaultLocale: Locale;
  supportPhone: string | null;
  branding: TenantBrandingDto | null;
}

export interface UpdateTenantBrandingDto {
  name?: string;
  branding: TenantBrandingDto;
}

export interface TenantSettingsDto {
  tenantId: Id;
  /** Turn ordering off platform-wide without a deploy. */
  ordersEnabled: boolean;
  /** Auto-confirm skips the operator review step on new orders. */
  autoConfirmOrders: boolean;
  /** Auto-assign runs the courier matching job on confirm. */
  autoAssignCouriers: boolean;
  defaultTariffId: Id | null;
  minAppVersion: string | null;
  maintenanceMessage: string | null;
}

export interface UpdateTenantSettingsDto {
  ordersEnabled?: boolean;
  autoConfirmOrders?: boolean;
  autoAssignCouriers?: boolean;
  defaultTariffId?: Id | null;
  minAppVersion?: string | null;
  maintenanceMessage?: string | null;
}
