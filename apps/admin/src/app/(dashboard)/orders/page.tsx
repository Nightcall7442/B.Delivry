'use client';

import { isTerminalOrderStatus, type OrderStatus } from '@bazar/constants';
import { tr } from '@bazar/storefront';
import { WS_EVENT, type OrderDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';
import { ORDER_LABEL, when } from '@/features/labels';
import { api } from '@/lib/api';
import { formatUzPhone } from '@bazar/utils/phone';

type Filter = 'active' | 'attention' | 'all';

/** What needs a human: nobody found, nobody confirmed, nothing moving. */
const ATTENTION: readonly OrderStatus[] = ['PENDING', 'SEARCHING_COURIER', 'FAILED'];

export default function OrdersPage() {
  const { isVendor } = useAuth();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const page = await api().orders.list({
      pageSize: 100,
      // A vendor's cabinet lists their stalls' orders, even if the same account also orders as a customer.
      ...(isVendor ? { as: 'store' as const } : {}),
      ...(filter === 'all' ? {} : { activeOnly: true }),
      ...(search.trim() ? { search: search.trim() } : {}),
    });
    setOrders(page.items);
    setLoading(false);
  }, [filter, search, isVendor]);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  // The operator room carries every status change in the city; one event is
  // one reload, which at this scale is cheaper than merging rows by hand.
  useEffect(() => {
    let cancelled = false;
    const realtime = api().realtime;
    const off = realtime.on(WS_EVENT.OPERATOR_ORDER_UPSERT, () => void load());
    void realtime.connect();
    api()
      .geo.cities()
      .then((cities) => {
        if (cancelled) return;
        for (const city of cities) realtime.join(`operator:${city.id}`);
      })
      .catch(() => undefined);
    // Sockets miss things across restarts; a slow poll keeps the board honest.
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      off();
      clearInterval(timer);
    };
  }, [load]);

  const rows = orders.filter((order) =>
    filter === 'attention' ? ATTENTION.includes(order.status) : true,
  );
  const attention = orders.filter((order) => ATTENTION.includes(order.status)).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-headline font-extrabold">Заказы</h1>
        {/* The filter and the search float over the ground: glass, not paper. */}
        <div className="glass ml-auto flex gap-1 rounded-full p-1">
          {(
            [
              ['active', 'Активные'],
              // The count is always there: the control keeps its width while the board changes.
              ['attention', `Внимание · ${attention}`],
              ['all', 'Все'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`h-9 whitespace-nowrap rounded-full px-4 text-sm font-semibold tabular-nums ${filter === key ? 'bg-[var(--cream)] text-[var(--ink-paper)]' : 'text-[var(--cream-muted)]'}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="glass h-11 w-full rounded-full px-4 sm:w-56 text-lead text-[var(--cream)] placeholder:text-[var(--cream-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron-400"
          placeholder="Номер заказа"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr>
              <th className="px-4 py-3">Заказ</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Точка</th>
              {/* On a phone the board keeps what tells orders apart; the rest is one tap away. */}
              <th className="hidden px-4 py-3 md:table-cell">Клиент</th>
              <th className="hidden px-4 py-3 md:table-cell">Курьер</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              <th className="px-4 py-3">Когда</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((order) => {
              const label = ORDER_LABEL[order.status];
              return (
                <tr key={order.id} className="hover:bg-sand-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-medium text-brand-700 underline-offset-2 hover:underline"
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge whitespace-nowrap ${label.tone}`}>{label.text}</span>
                  </td>
                  <td className="px-4 py-3">{tr(order.store.name, 'ru')}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums md:table-cell">
                    {order.customer?.phone ? formatUzPhone(order.customer.phone) : '—'}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {order.delivery?.courierId ? (
                      <span className="text-ink">назначен</span>
                    ) : isTerminalOrderStatus(order.status) ? (
                      '—'
                    ) : (
                      <span className="text-ink-muted">нет</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {formatMoney(order.totals.total.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    {when(order.placedAt)}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-muted">
                  {search.trim()
                    ? `По «${search.trim()}» ничего не нашли — проверьте номер заказа.`
                    : filter === 'active'
                      ? 'Активных заказов нет — новые появятся здесь сами.'
                      : filter === 'attention'
                        ? 'Всё идёт своим ходом: заказов, которым нужен человек, нет.'
                        : 'Заказов пока нет.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
