'use client';

import type { PublicTenantDto } from '@bazar/types';
import type { ReactNode } from 'react';

import { AddressProvider } from '@/features/address';
import { AuthProvider } from '@/features/auth';
import { BrandingProvider } from '@/features/branding';
import { CartProvider } from '@/features/cart';

export function Providers({ tenant, children }: { tenant: PublicTenantDto; children: ReactNode }) {
  return (
    <BrandingProvider tenant={tenant}>
      <AuthProvider>
        <AddressProvider>
          <CartProvider>{children}</CartProvider>
        </AddressProvider>
      </AuthProvider>
    </BrandingProvider>
  );
}
