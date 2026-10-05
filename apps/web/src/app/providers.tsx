'use client';

import type { PublicTenantDto } from '@bazar/types';
import type { ReactNode } from 'react';

import { AddressProvider } from '@/features/address';
import { AuthProvider } from '@/features/auth';
import { BrandingProvider } from '@/features/branding';
import { CartProvider } from '@/features/cart';
import { FavoritesProvider } from '@/features/favorites';

export function Providers({ tenant, children }: { tenant: PublicTenantDto; children: ReactNode }) {
  return (
    <BrandingProvider tenant={tenant}>
      <AuthProvider>
        <AddressProvider>
          <CartProvider>
            <FavoritesProvider>{children}</FavoritesProvider>
          </CartProvider>
        </AddressProvider>
      </AuthProvider>
    </BrandingProvider>
  );
}
