/**
 * Накладная: a printable A4-ish page for one order. Seller, buyer with INN,
 * lines with the weighed quantities, delivery, total, due date. The browser's
 * print dialog makes the PDF — no PDF library, no server rendering.
 */
'use client';

import { createT } from '@bazar/i18n';
import { tr, unitLabel } from '@bazar/storefront';
import type { CustomerDto, OrderDto } from '@bazar/types';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

export function InvoiceView({ orderId, locale }: { orderId: string; locale: string }) {
  const t = createT(locale);
  const units = unitLabel(locale);
  const { user, ready } = useAuth();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [me, setMe] = useState<CustomerDto | null>(null);
  useEffect(() => {
    if (!user) return;
    Promise.all([api().orders.get(orderId), api().customers.me()])
      .then(([row, customer]) => {
        setOrder(row);
        setMe(customer);
      })
      .catch(() => undefined);
  }, [user, orderId]);

  if (!ready || !order) return <main className="p-6 text-sm text-ink-muted">…</main>;
  const paid = order.paymentStatus === 'CAPTURED';
  return (
    <main
      data-theme="light"
      className="mx-auto max-w-[720px] bg-white p-8 text-sm text-ink print:p-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-extrabold">
            {t('invoice.title', { number: order.number })}
          </h1>
          <p className="mt-1 text-ink-muted">{t.date(order.placedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-go-secondary h-10 w-auto px-4 print:hidden"
        >
          {t('docs.print')}
        </button>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-muted">{t('invoice.seller')}</dt>
          <dd className="mt-1 font-medium">{tr(order.store.name, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-muted">{t('invoice.buyer')}</dt>
          <dd className="mt-1 font-medium">{me?.companyName ?? order.customer?.firstName ?? ''}</dd>
          <dd className="text-ink-muted">
            {me?.companyInn ? t('invoice.inn', { inn: me.companyInn }) : ''}
            {order.customer?.phone ? ` · ${order.customer.phone}` : ''}
          </dd>
          <dd className="text-ink-muted">{order.address.formatted}</dd>
        </div>
      </dl>
      <table className="mt-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-muted">
            <th className="py-2">{t('invoice.item')}</th>
            <th className="py-2 text-right">{t('invoice.qty')}</th>
            <th className="py-2 text-right">{t('invoice.price')}</th>
            <th className="py-2 text-right">{t('invoice.sum')}</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-line">
              <td className="py-2">{tr(item.name, locale)}</td>
              <td className="py-2 text-right tabular-nums">
                {item.actualQuantity ?? item.quantity} {units[item.unit]}
              </td>
              <td className="py-2 text-right tabular-nums">{t.money(item.unitPrice.amount)}</td>
              <td className="py-2 text-right tabular-nums">{t.money(item.total.amount)}</td>
            </tr>
          ))}
          <tr className="border-b border-line">
            <td className="py-2" colSpan={3}>
              {t('invoice.delivery')}
            </td>
            <td className="py-2 text-right tabular-nums">
              {t.money(order.totals.deliveryFee.amount)}
            </td>
          </tr>
          {order.totals.serviceFee.amount > 0 ? (
            <tr className="border-b border-line">
              <td className="py-2" colSpan={3}>
                {t('checkout.serviceFee')}
              </td>
              <td className="py-2 text-right tabular-nums">
                {t.money(order.totals.serviceFee.amount)}
              </td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="font-display text-base font-extrabold">
            <td className="py-3" colSpan={3}>
              {t('invoice.total')}
            </td>
            <td className="py-3 text-right tabular-nums">{t.money(order.totals.total.amount)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-4 text-ink-muted">
        {order.dueAt ? `${t('invoice.due')}: ${t.date(order.dueAt)} · ` : ''}
        {paid ? t('invoice.paid') : t('invoice.unpaid')}
      </p>
      <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-ink-muted">
        <p className="border-t border-line pt-2">
          {t('invoice.seller')} · {t('invoice.sign')}
        </p>
        <p className="border-t border-line pt-2">
          {t('invoice.buyer')} · {t('invoice.sign')}
        </p>
      </div>
    </main>
  );
}
