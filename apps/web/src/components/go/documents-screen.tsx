/** Invoices of a B2B customer: what is open, what is paid, each one printable. */
'use client';

import { createT } from '@bazar/i18n';
import { paymentStatusText, tr } from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

export function DocumentsScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<OrderDto[] | null>(null);
  useEffect(() => {
    if (!user) return;
    api()
      .orders.list({ paymentMethod: 'INVOICE', pageSize: 50 })
      .then((page) => setRows(page.items))
      .catch(() => setRows([]));
  }, [user]);
  const open = (rows ?? []).filter(
    (o) => o.paymentStatus !== 'CAPTURED' && o.status !== 'CANCELLED',
  );
  const openTotal = open.reduce((sum, o) => sum + o.totals.total.amount, 0);

  return (
    <GoShell
      locale={locale}
      back="history"
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('docs.title')}</h1>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">{t('docs.intro')}</p>
      {!ready ? null : !user ? (
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/documents`)}`}
          className="btn-go mt-4"
        >
          {t('common.signIn')}
        </Link>
      ) : rows === null ? null : rows.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">{t('docs.empty')}</p>
      ) : (
        <>
          <p className="mt-3 flex justify-between rounded-2xl bg-saffron-100 px-4 py-3 text-sm">
            <span>{t('docs.open')}</span>
            <span className="font-display font-bold tabular-nums">{t.money(openTotal)}</span>
          </p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {rows.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {order.number} · {tr(order.store.name, locale)}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {t.date(order.placedAt)}
                    {order.dueAt
                      ? ` · ${t('order.invoiceDue', { date: t.date(order.dueAt) })}`
                      : ''}
                    {' · '}
                    {paymentStatusText(locale)[order.paymentStatus]}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums">{t.money(order.totals.total.amount)}</span>
                  <Link
                    href={`/${locale}/orders/${order.id}/invoice`}
                    className="text-xs text-brand-700 underline"
                  >
                    {t('order.invoice')}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </GoShell>
  );
}
