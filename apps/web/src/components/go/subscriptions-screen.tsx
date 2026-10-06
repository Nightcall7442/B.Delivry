/** "Every Saturday by 8:00": the baskets that place themselves. */
'use client';

import { createT } from '@bazar/i18n';
import { slotLabel, subscriptionWhen, tr } from '@bazar/storefront';
import type { CartSubscriptionDto } from '@bazar/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

export function SubscriptionsScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<CartSubscriptionDto[] | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    api()
      .subscriptions.list()
      .then(setRows)
      .catch(() => setRows([]));
  }, [user]);
  useEffect(load, [load]);

  const patch = (id: string, active: boolean) =>
    api()
      .subscriptions.update(id, { active })
      .then(load)
      .catch(() => undefined);
  const remove = (id: string) =>
    api()
      .subscriptions.remove(id)
      .then(load)
      .catch(() => undefined);

  return (
    <GoShell locale={locale} back="history" expanded header={<h1>{t('subs.title')}</h1>}>
      <p className="mt-1 text-sm text-ink-muted">{t('subs.intro')}</p>
      {!ready ? null : !user ? (
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/subscriptions`)}`}
          className="btn-go mt-4"
        >
          {t('common.signIn')}
        </Link>
      ) : rows === null ? null : rows.length === 0 ? (
        <>
          <p className="mt-4 font-serif text-[length:var(--fs-lead)] font-bold leading-6">
            {t('subs.emptyTitle')}
          </p>
          <p className="mt-1 text-sm text-ink-muted">{t('subs.empty')}</p>
          <Link href={`/${locale}/orders`} className="btn-go mt-4">
            {t('menu.orders')}
          </Link>
        </>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-paper bg-sand-50 p-4">
              <p className="font-serif text-[length:var(--fs-lead)] font-bold leading-6">
                {subscriptionWhen(row, locale)}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {tr(row.storeName, locale)} · {t.n('cart.items', row.items.length)} ·{' '}
                {row.addressText}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {row.active
                  ? t('subs.next', { when: slotLabel(row.nextRunAt, locale) })
                  : t('subs.paused')}
              </p>
              {row.lastError ? (
                <p className="mt-1 text-xs text-danger">
                  {t('subs.lastError', { error: row.lastError })}
                </p>
              ) : null}
              <div className="mt-2 flex gap-4 text-sm">
                <button
                  type="button"
                  className="font-medium text-brand-700"
                  onClick={() => void patch(row.id, !row.active)}
                >
                  {row.active ? t('subs.pause') : t('subs.resume')}
                </button>
                {row.lastOrderId ? (
                  <Link href={`/${locale}/orders/${row.lastOrderId}`} className="font-medium">
                    {t('subs.lastOrder')}
                  </Link>
                ) : null}
                <button type="button" className="text-danger" onClick={() => void remove(row.id)}>
                  {t('subs.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GoShell>
  );
}
