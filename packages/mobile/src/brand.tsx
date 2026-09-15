/**
 * White-label on the phone: the tenant's app name and city, read once at
 * boot from the API (`GET /tenants/current`). Colours stay the build's own —
 * StyleSheets are static; a differently coloured app is a differently built
 * app (EAS profile per brand), which is how the stores want it anyway.
 */
import type { TenantBrandingDto } from '@bazar/types';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from './api';

const DEFAULT: TenantBrandingDto = {
  appName: 'bazar',
  city: null,
  logoUrl: null,
  primary: null,
  accent: null,
};

const BrandContext = createContext<TenantBrandingDto>(DEFAULT);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<TenantBrandingDto>(DEFAULT);
  useEffect(() => {
    api()
      .tenants.current()
      .then((tenant) => tenant.branding && setBrand(tenant.branding))
      .catch(() => undefined);
  }, []);
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export const useBrand = (): TenantBrandingDto => useContext(BrandContext);
