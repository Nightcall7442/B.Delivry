'use client';

import { isApiError, room } from '@bazar/api-client';
import {
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  isTerminalOrderStatus,
  type OrderStatus,
} from '@bazar/constants';
import {
  PAYMENT_METHOD_TEXT,
  SUBSTITUTION_TEXT,
  UNIT_LABEL,
  slotLabel,
  tr,
} from '@bazar/storefront';
import { WS_EVENT, type CourierDto, type OrderDto, type OrderTrackingDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  COURIER_LABEL,
  DELIVERY_LABEL,
  ORDER_LABEL,
  VEHICLE_LABEL,
  ago,
  when,
} from '@/features/labels';
import { api } from '@/lib/api';

/** Moves the desk may make by hand; courier steps stay with the courier app. */
const MANUAL: readonly OrderStatus[] = [
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.REFUNDED,
];

export default function OrderPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [tracking, setTracking] = useState<OrderTrackingDto | null>(null);
  const [couriers, setCouriers] = useState<CourierDto[]>([]);
  const [courierId, setCourierId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [fetched, live] = await Promise.all([
      api().orders.get(orderId),
      api()
        .tracking.order(orderId)
        .catch(() => null),
    ]);
    setOrder(fetched);
    setTracking(live);
  }, [orderId]);

  useEffect(() => {
    load().catch((cause: unknown) => setError(describe(cause)));
    api()
      .couriers.list({ pageSize: 100 })
      .then((page) => setCouriers(page.items))
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    const realtime = api().realtime;
    void realtime.connect();
    realtime.join(room.order(orderId));
    const offStatus = realtime.on(WS_EVENT.ORDER_STATUS_CHANGED, (event) => {
      if (event.orderId === orderId) void load();
    });
    const offPayment = realtime.on(WS_EVENT.ORDER_PAYMENT_UPDATED, (event) => {
      if (event.orderId === orderId) void load();
    });
    const offLocation = realtime.on(WS_EVENT.COURIER_LOCATION, (event) => {
      if (event.orderId !== orderId) return;
      setTracking((current) =>
        current ? { ...current, courierPoint: event.point, courierUpdatedAt: event.at } : current,
      );
    });
    return () => {
      offStatus();
      offPayment();
      offLocation();
      realtime.leave(room.order(orderId));
    };
  }, [orderId, load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return <p className="text-ink-muted">{error ?? 'Загружаем…'}</p>;
  }

  const label = ORDER_LABEL[order.status];
  const terminal = isTerminalOrderStatus(order.status);
  const delivery = order.delivery;
  const legal = ORDER_STATUS_TRANSITIONS[order.status].filter((status) => MANUAL.includes(status));
  const courier = tracking?.courier ?? null;
  const online = couriers.filter((c) => c.status === 'ONLINE' || c.status === 'BUSY');

  return (
    <div className="max-w-5xl">
      <Link href="/orders" className="text-sm text-ink-muted hover:text-ink">
        ← Все заказы
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold">{order.number}</h1>
        <span className={`badge ${label.tone}`}>{label.text}</span>
        <span className="text-sm text-ink-muted">{when(order.placedAt)}</span>
      </div>

      {error ? (
        <p className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="font-display text-base font-bold">Кто и куда</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <dt className="text-ink-muted">Клиент</dt>
              <dd className="tabular-nums">
                {order.customer?.firstName ? `${order.customer.firstName} · ` : ''}
                {order.customer?.phone ? (
                  <a
                    href={`tel:${order.customer.phone}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {order.customer.phone}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt className="text-ink-muted">Адрес</dt>
              <dd>
                {order.address.formatted}
                {order.address.point ? (
                  <span className="ml-2 tabular-nums text-ink-faint">
                    {order.address.point.lat.toFixed(4)}, {order.address.point.lng.toFixed(4)}
                  </span>
                ) : null}
              </dd>
              <dt className="text-ink-muted">Точка</dt>
              <dd>{tr(order.store.name, 'ru')}</dd>
              {order.scheduledFor ? (
                <>
                  <dt className="text-ink-muted">Окно доставки</dt>
                  <dd className="font-medium">{slotLabel(order.scheduledFor)}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">Оплата</dt>
              <dd>
                {PAYMENT_METHOD_TEXT[order.paymentMethod].title} · {order.paymentStatus}
              </dd>
              {order.comment ? (
                <>
                  <dt className="text-ink-muted">Курьеру</dt>
                  <dd className="whitespace-pre-line">{order.comment}</dd>
                </>
              ) : null}
              {order.vendorComment ? (
                <>
                  <dt className="text-ink-muted">Продавцу</dt>
                  <dd className="whitespace-pre-line">{order.vendorComment}</dd>
                </>
              ) : null}
              <dt className="text-ink-muted">Если нет товара</dt>
              <dd>{SUBSTITUTION_TEXT[order.substitutionPolicy].title}</dd>
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="font-display text-base font-bold">Состав</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2">
                  <span>
                    {tr(item.name, 'ru')}{' '}
                    <span className="text-ink-muted">
                      × {item.actualQuantity ?? item.quantity} {UNIT_LABEL[item.unit]}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatMoney((item.actualTotal ?? item.total).amount)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1 border-t border-line pt-2 text-sm">
              <dt className="text-ink-muted">Товары</dt>
              <dd className="tabular-nums">{formatMoney(order.totals.subtotal.amount)}</dd>
              <dt className="text-ink-muted">Доставка</dt>
              <dd className="tabular-nums">{formatMoney(order.totals.deliveryFee.amount)}</dd>
              <dt className="text-ink-muted">Сервисный сбор</dt>
              <dd className="tabular-nums">{formatMoney(order.totals.serviceFee.amount)}</dd>
              <dt className="font-bold">Итого</dt>
              <dd className="font-bold tabular-nums">{formatMoney(order.totals.total.amount)}</dd>
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="font-display text-base font-bold">История</h2>
            <ol className="mt-2 text-sm">
              {order.statusHistory.map((entry, index) => (
                <li key={`${entry.status}-${index}`} className="flex gap-3 py-1">
                  <span className="w-32 shrink-0 tabular-nums text-ink-muted">
                    {when(entry.at)}
                  </span>
                  <span>
                    {ORDER_LABEL[entry.status].text}
                    {entry.comment ? (
                      <span className="text-ink-muted"> — {entry.comment}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="font-display text-base font-bold">Курьер</h2>
            {courier ? (
              <div className="mt-2 text-sm">
                <div className="font-medium">
                  {courier.firstName} · ★ {courier.rating.toFixed(1)} ·{' '}
                  {VEHICLE_LABEL[courier.vehicleType] ?? courier.vehicleType}
                </div>
                <div className="text-ink-muted">
                  {delivery ? DELIVERY_LABEL[delivery.status] : ''}
                  {tracking?.courierPoint
                    ? ` · ${tracking.courierPoint.lat.toFixed(4)}, ${tracking.courierPoint.lng.toFixed(4)} · ${ago(tracking.courierUpdatedAt)}`
                    : ' · позиции нет'}
                </div>
                {tracking?.etaAt ? (
                  <div className="text-ink-muted">ETA {when(tracking.etaAt)}</div>
                ) : null}
                {delivery && !terminal ? (
                  <button
                    type="button"
                    className="btn-danger mt-3 w-full"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        api().delivery.release(delivery.id, reason.trim() || 'Снят диспетчером'),
                      )
                    }
                  >
                    Снять курьера
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                {terminal
                  ? 'Заказ закрыт.'
                  : delivery
                    ? 'Не назначен.'
                    : 'Доставка ещё не открыта.'}
              </p>
            )}

            {delivery && !delivery.courierId && !terminal ? (
              <div className="mt-3 flex flex-col gap-2">
                <select
                  className="field"
                  value={courierId}
                  onChange={(event) => setCourierId(event.target.value)}
                >
                  <option value="">Выбрать курьера…</option>
                  {online.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} · {COURIER_LABEL[c.status].text} · {ago(c.lastLocationAt)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || !courierId}
                  onClick={() => void run(() => api().delivery.assign(delivery.id, courierId))}
                >
                  Назначить
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void run(() => api().delivery.restartSearch(delivery.id))}
                >
                  Искать заново
                </button>
              </div>
            ) : null}
          </section>

          <section className="card p-4">
            <h2 className="font-display text-base font-bold">Статус</h2>
            <div className="mt-2 flex flex-col gap-2">
              {order.status === ORDER_STATUS.PENDING ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy}
                  onClick={() => void run(() => api().orders.confirm(order.id))}
                >
                  Подтвердить
                </button>
              ) : null}
              {legal.length > 0 ? (
                <>
                  <input
                    className="field"
                    placeholder="Причина (видна клиенту)"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  {legal.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={status === ORDER_STATUS.DELIVERED ? 'btn-secondary' : 'btn-danger'}
                      disabled={
                        busy || (status !== ORDER_STATUS.DELIVERED && reason.trim().length < 3)
                      }
                      onClick={() =>
                        void run(() =>
                          status === ORDER_STATUS.CANCELLED
                            ? api().orders.cancel(order.id, { reason: reason.trim() })
                            : api().orders.changeStatus(order.id, {
                                status,
                                ...(reason.trim() ? { comment: reason.trim() } : {}),
                              }),
                        )
                      }
                    >
                      {ORDER_LABEL[status].text}
                    </button>
                  ))}
                </>
              ) : null}
              {terminal ? <p className="text-sm text-ink-muted">Заказ закрыт.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

const describe = (error: unknown): string =>
  isApiError(error) ? `${error.message} (${error.code})` : 'Что-то пошло не так';
