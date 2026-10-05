/**
 * «Свой продавец» on a stall's page: the customer is known here — how many times they bought, since
 * when — and one click puts the last order back in the basket, the wishes beside the lines, straight
 * to checkout. Shown only to someone who has bought here before.
 */
'use client';

import type { T } from '@bazar/i18n';
import { repeatNotes, repeatQuantities } from '@bazar/storefront';
import type { MyStallDto } from '@bazar/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';
import { useCartActions, useCartNotes, useCartQuantities } from '@/features/cart';
import { api } from '@/lib/api';

import s from './bazar.module.css';

export function RegularCard({
  storeId,
  seller,
  locale,
  t,
}: {
  storeId: string;
  seller: string;
  locale: string;
  t: T;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const quantities = useCartQuantities();
  const { replace } = useCartActions();
  const { setNote } = useCartNotes();
  const [mine, setMine] = useState<MyStallDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api()
      .regulars.mine(storeId)
      .then((value) => alive && setMine(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [storeId, user]);

  if (!user || mine === null || mine.orders === 0 || mine.lastOrderId === null) return null;
  const lastOrderId = mine.lastOrderId;

  const again = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const order = await api().orders.get(lastOrderId);
      replace(repeatQuantities(order.items, quantities));
      for (const [productId, wish] of Object.entries(repeatNotes(order.items))) {
        setNote(productId, wish);
      }
      router.push(`/${locale}/checkout?store=${storeId}`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.regular} aria-label={t('regular.title')}>
      <span className={s.regularHead}>
        ♥ {t('regular.title')} <span className={s.regularSeller}>· {seller}</span>
      </span>
      <span className={s.regularLine}>
        {t.n('regular.times', mine.orders)}
        {mine.since ? ` ${t('regular.since', { date: t.date(mine.since) })}` : ''}
      </span>
      <button type="button" className={s.regularAgain} onClick={() => void again()} disabled={busy}>
        <span className={s.regularAgainTitle}>{t('regular.again')} →</span>
        <span className={s.regularAgainHint}>{t('regular.againHint')}</span>
      </button>
      {failed ? (
        <span className={s.regularError} role="alert">
          {t('regular.failed')}
        </span>
      ) : null}
    </section>
  );
}
