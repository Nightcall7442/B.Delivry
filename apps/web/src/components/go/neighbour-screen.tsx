/** "Стать курьером махалли": a customer volunteers to walk orders to neighbours. */
'use client';

import { NEIGHBOUR_COURIER } from '@bazar/constants';
import { createT } from '@bazar/i18n';
import { ensureServerAddress } from '@bazar/storefront';
import Link from 'next/link';
import { useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

export function NeighbourScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { address, setAddress } = useAddress();
  const { user, ready } = useAuth();
  const [done, setDone] = useState(user?.courierId !== null && user?.courierId !== undefined);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    if (!address) {
      setError(t('neighbour.needAddress'));
      return;
    }
    setError(null);
    try {
      const addressId = await ensureServerAddress(api(), address, setAddress);
      await api().couriers.apply(addressId);
      setDone(true);
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <GoShell
      locale={locale}
      back="history"
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">
          {t('neighbour.title')}
        </h1>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">
        {t('neighbour.intro', { km: NEIGHBOUR_COURIER.HOME_RADIUS_METERS / 1000 })}
      </p>
      {!ready ? null : !user ? (
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/neighbour`)}`}
          className="btn-go mt-4"
        >
          {t('common.signIn')}
        </Link>
      ) : done ? (
        <p className="mt-4 rounded-2xl bg-brand-50 p-4 text-sm">{t('neighbour.applied')}</p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            {t('checkout.where')}: <span className="font-medium">{address?.text ?? '—'}</span>
          </p>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          <button type="button" className="btn-go mt-4" onClick={() => void apply()}>
            {t('neighbour.apply')}
          </button>
        </>
      )}
    </GoShell>
  );
}
