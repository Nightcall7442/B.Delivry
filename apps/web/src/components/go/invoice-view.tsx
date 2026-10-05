/**
 * Накладная: a printable A4-ish page for one order. Seller, buyer with INN,
 * lines with the weighed quantities, delivery, total, due date. The browser's
 * print dialog makes the PDF — no PDF library, no server rendering.
 */
'use client';

import { createT } from '@bazar/i18n';
import { tr, unitLabel } from '@bazar/storefront';
import type { CustomerDto, OrderDto } from '@bazar/types';
import { formatUzPhone } from '@bazar/utils/phone';
import Link from 'next/link';
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

  if (!ready || !order)
    return <main className="hall min-h-dvh p-6 text-sm text-[var(--cream-muted)]">…</main>;
  const paid = order.paymentStatus === 'CAPTURED';
  // The number stays whole («BZ-260901-HIST01» broke at a hyphen); the words around it may wrap.
  const [before = '', after = ''] = t('invoice.title', { number: '\u0001' }).split('\u0001');
  const buyerLine = [
    me?.companyInn ? t('invoice.inn', { inn: me.companyInn }) : null,
    order.customer?.phone ? formatUzPhone(order.customer.phone) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Amounts never break between the digits and «сум».
  const num = 'py-2 pl-2 text-right tabular-nums whitespace-nowrap';
  return (
    // A sheet of paper in the hall on the screen; on the printer only the sheet is left.
    <div className="hall min-h-dvh px-3 py-6 sm:px-4 sm:py-8 print:min-h-0 print:bg-transparent print:p-0 print:before:hidden print:after:hidden">
      <main
        data-theme="light"
        className="paper-sheet mx-auto max-w-[720px] rounded-paper p-5 text-sm text-ink sm:p-8 print:bg-transparent print:p-0 print:shadow-none"
      >
        <Link
          href={`/${locale}/orders/${order.id}`}
          className="mb-4 inline-block text-ink-muted underline decoration-line-strong underline-offset-4 print:hidden"
        >
          ← {t('order.title')}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-[length:var(--fs-title)] font-bold leading-[26px]">
              {before}
              <span className="whitespace-nowrap">{order.number}</span>
              {after}
            </h1>
            <p className="mt-1 text-ink-muted">{t.date(order.placedAt)}</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-go-secondary h-10 w-auto shrink-0 px-4 print:hidden"
          >
            {t('docs.print')}
          </button>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4">
          <div>
            <dt className="eyebrow text-ink-muted">{t('invoice.seller')}</dt>
            <dd className="mt-1 font-medium">{tr(order.store.name, locale)}</dd>
          </div>
          <div>
            <dt className="eyebrow text-ink-muted">{t('invoice.buyer')}</dt>
            <dd className="mt-1 font-medium">
              {me?.companyName ?? order.customer?.firstName ?? ''}
            </dd>
            {buyerLine ? <dd className="text-ink-muted">{buyerLine}</dd> : null}
            <dd className="text-ink-muted">{order.address.formatted}</dd>
          </div>
        </dl>
        {/* Ink-muted heads: the eyebrow's saffron is for the hall, it fades on paper. */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] sm:text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="eyebrow py-2 tracking-normal text-ink-muted sm:tracking-[0.14em]">
                  {t('invoice.item')}
                </th>
                <th className="eyebrow whitespace-nowrap py-2 pl-2 text-right tracking-normal text-ink-muted sm:tracking-[0.14em]">
                  {t('invoice.qty')}
                </th>
                <th className="eyebrow hidden whitespace-nowrap py-2 pl-2 text-right tracking-normal text-ink-muted sm:table-cell sm:tracking-[0.14em] print:table-cell">
                  {t('invoice.price')}
                </th>
                <th className="eyebrow whitespace-nowrap py-2 pl-2 text-right tracking-normal text-ink-muted sm:tracking-[0.14em]">
                  {t('invoice.sum')}
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-2">
                    {tr(item.name, locale)}
                    {/* A phone has no room for the price column: the price rides under the name. */}
                    <span className="block text-xs text-ink-muted sm:hidden print:hidden">
                      {t.money(item.unitPrice.amount)} / {units[item.unit]}
                    </span>
                  </td>
                  <td className={num}>
                    {t.qty(item.actualQuantity ?? item.quantity)} {units[item.unit]}
                  </td>
                  <td className={`${num} hidden sm:table-cell print:table-cell`}>
                    {t.money(item.unitPrice.amount)}
                  </td>
                  <td className={num}>{t.money(item.total.amount)}</td>
                </tr>
              ))}
              <tr className="border-b border-line">
                <td className="py-2" colSpan={2}>
                  {t('invoice.delivery')}
                </td>
                <td className="hidden sm:table-cell print:table-cell" />
                <td className={num}>{t.money(order.totals.deliveryFee.amount)}</td>
              </tr>
              {order.totals.serviceFee.amount > 0 ? (
                <tr className="border-b border-line">
                  <td className="py-2" colSpan={2}>
                    {t('checkout.serviceFee')}
                  </td>
                  <td className="hidden sm:table-cell print:table-cell" />
                  <td className={num}>{t.money(order.totals.serviceFee.amount)}</td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="text-[length:var(--fs-lead)] font-extrabold leading-6">
                <td className="py-3" colSpan={2}>
                  {t('invoice.total')}
                </td>
                <td className="hidden sm:table-cell print:table-cell" />
                <td className="whitespace-nowrap py-3 pl-2 text-right tabular-nums">
                  {t.money(order.totals.total.amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
    </div>
  );
}
