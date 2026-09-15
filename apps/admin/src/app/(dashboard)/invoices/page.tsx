'use client';

import { tr } from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/** B2B invoices: what is open, what is overdue; the bank transfer arrived → "Оплачен". */
export default function InvoicesPage() {
  const [rows, setRows] = useState<OrderDto[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const load = () =>
    api()
      .orders.list({ paymentMethod: 'INVOICE', pageSize: 100 })
      .then((page) => setRows(page.items))
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);

  const markPaid = async (order: OrderDto) => {
    try {
      await api().orders.invoicePaid(order.id);
      setNote(`${order.number}: оплачен`);
      void load();
    } catch {
      setNote('Не получилось');
    }
  };
  const open = rows.filter((o) => o.paymentStatus !== 'CAPTURED' && o.status !== 'CANCELLED');
  const overdue = open.filter((o) => o.dueAt !== null && Date.parse(o.dueAt) < Date.now());

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Счета</h1>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          ['Открыто', formatMoney(open.reduce((s, o) => s + o.totals.total.amount, 0))],
          ['Просрочено', String(overdue.length)],
          ['Всего по счёту', String(rows.length)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs uppercase tracking-wider text-ink-muted">{label}</div>
            <div className="mt-1 font-display text-xl font-extrabold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {note ? <p className="mt-2 text-sm text-brand-700">{note}</p> : null}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Заказ</th>
              <th className="px-4 py-3">Покупатель</th>
              <th className="px-4 py-3">Срок</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((order) => {
              const late = order.dueAt !== null && Date.parse(order.dueAt) < Date.now();
              const paid = order.paymentStatus === 'CAPTURED';
              return (
                <tr key={order.id}>
                  <td className="px-4 py-2">
                    <Link href={`/orders/${order.id}`} className="font-medium underline">
                      {order.number}
                    </Link>
                    <div className="text-xs text-ink-muted">{tr(order.store.name, 'ru')}</div>
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {order.customer?.firstName ?? ''} {order.customer?.phone ?? ''}
                  </td>
                  <td className={`px-4 py-2 ${late && !paid ? 'text-danger' : ''}`}>
                    {order.dueAt ? new Date(order.dueAt).toLocaleDateString('ru-RU') : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMoney(order.totals.total.amount)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`badge ${paid ? 'badge-ok' : ''}`}>
                      {paid ? 'оплачен' : late ? 'просрочен' : 'ждёт оплаты'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!paid && order.status !== 'CANCELLED' ? (
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void markPaid(order)}
                      >
                        Оплачен
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
