/**
 * White-label: the tenant behind the host the browser opened. The root layout
 * fetches it on the server, paints its colours as CSS variables and hands the
 * names down here, so a wordmark never flashes the default brand.
 */
'use client';

import type { PublicTenantDto } from '@bazar/types';
import { createContext, useContext, type ReactNode } from 'react';

export const DEFAULT_BRAND: PublicTenantDto = {
  slug: 'bazar',
  name: 'Bazar Delivery',
  defaultLocale: 'ru',
  supportPhone: null,
  branding: null,
};

const BrandingContext = createContext<PublicTenantDto>(DEFAULT_BRAND);

export function BrandingProvider({
  tenant,
  children,
}: {
  tenant: PublicTenantDto;
  children: ReactNode;
}) {
  return <BrandingContext.Provider value={tenant}>{children}</BrandingContext.Provider>;
}

export const useBranding = (): PublicTenantDto => useContext(BrandingContext);

/** The wordmark: the tenant's app name, "bazar" for the platform itself. */
export const useAppName = (): string => useBranding().branding?.appName ?? 'bazar';
