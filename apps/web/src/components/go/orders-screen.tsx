'use client';

import { isTerminalOrderStatus } from '@bazar/constants';
import { orderStatusText, tr } from '@bazar/storefront';
import { createT } from '@bazar/i18n';
import Link from 'next/link';

import { GoShell } from '@/components/go/go-shell';
import { Chevron, Receipt } from '@/components/go/icons';
import { DEFAULT_POINT, useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { useOrderList } from '@/features/orders';

export function OrdersScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { user, ready: authReady } = useAuth();
  const { orders, ready } = useOrderList();
  const { address } = useAddress();

  return (
    <GoShell
      locale={locale}
      back={`/${locale}`}
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('orders.title')}</h1>
      }
    >
      {!authReady || !ready ? null : !user ? (
        <div className="py-12 text-center">
          <p className="text-lg font-medium">{t('orders.signIn')}</p>
          <Link
            href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/orders`)}`}
            className="btn-go mt-6"
          >
            {t('common.signIn')}
          </Link>
        </div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sand-100 text-brand-600">
            <Receipt />
          </span>
          <p className="mt-3 text-lg font-medium">{t('orders.empty')}</p>
          <Link href={`/${locale}`} className="btn-go mt-6">
            {t('common.toStores')}
          </Link>
        </div>
      ) : (
        <ul className="-mx-3 mt-1">
          {orders.map((order) => {
            const done = isTerminalOrderStatus(order.status);
            return (
              <li key={order.id}>
                <Link href={`/${locale}/orders/${order.id}`} className="go-row">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${done ? 'bg-line-strong' : 'bg-brand-500'}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">
                      {tr(order.store.name, locale)}
                    </span>
                    <span className="block truncate text-sm text-ink-muted">
                      {orderStatusText(locale)[order.status].title} ·{' '}
                      {t.money(order.totals.total.amount)} ·{' '}
                      {new Date(order.placedAt).toLocaleString(
                        locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU',
                        {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        },
                      )}
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </GoShell>
  );
}
