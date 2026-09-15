/**
 * The waiting screen: courier on the map, status and tile progress in the
 * sheet. Everything here is the API's order and the tracking room — the same
 * layout for every status, only the words, the tiles and the buttons change.
 */
'use client';

import { ORDER_STATUS, isTerminalOrderStatus } from '@bazar/constants';
import { haversineMeters } from '@bazar/maps';
import {
  ONLINE_PROVIDERS,
  SLOT_HOURS,
  WEEKDAY_ORDER,
  freshnessDeadline,
  freshnessOpen,
  lateMinutes,
  lateRefundDue,
  onlinePaymentDue,
  orderStatusText,
  orderSteps,
  paymentMethodText,
  paymentStatusText,
  repeatQuantities,
  slotLabel,
  slotTime,
  startOnlinePayment,
  tr,
  unitLabel,
} from '@bazar/storefront';
import { createT, type MessageKey } from '@bazar/i18n';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AfterDelivery } from '@/components/go/after-delivery';
import { GoShell } from '@/components/go/go-shell';
import { OrderChat } from '@/components/go/order-chat';
import { Chat, Chevron, HomeGlyph, Phone, Receipt } from '@/components/go/icons';
import { DEFAULT_POINT } from '@/features/address';
import { useAuth } from '@/features/auth';
import { useCartActions, useCartQuantities } from '@/features/cart';
import { useLiveOrder } from '@/features/orders';
import { api } from '@/lib/api';

const VEHICLES = ['FOOT', 'BICYCLE', 'SCOOTER', 'MOTORBIKE', 'CAR', 'VAN'];

export function OrderScreen({ orderId, locale }: { orderId: string; locale: string }) {
  const t = createT(locale);
  const { user, ready: authReady } = useAuth();
  const { order, courier, courierInfo, etaMinutes, cancellable, ready, cancel } =
    useLiveOrder(orderId);
  const [confirming, setConfirming] = useState(false);
  const [details, setDetails] = useState(false);
  const [chat, setChat] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Delivered: the two promises. Late → the fee is already back (API did it);
  // freshness → one line and a button, for two hours.
  const [complaint, setComplaint] = useState('');
  const [complaintSent, setComplaintSent] = useState<string | null>(null);
  const [complaining, setComplaining] = useState(false);
  // "Every Saturday by 8:00": the same basket, placed by the platform each week.
  const [subscribing, setSubscribing] = useState(false);
  const [subWeekday, setSubWeekday] = useState(6);
  const [subHour, setSubHour] = useState<number>(SLOT_HOURS[0]);
  const [subscribed, setSubscribed] = useState<string | null>(null);
  const subscribe = async (weekdays: number[] = [subWeekday]) => {
    if (!order) return;
    try {
      // "Каждый рабочий день": one subscription per weekday — the job runs them independently.
      const runs: string[] = [];
      for (const weekday of weekdays) {
        const created = await api().subscriptions.create({
          orderId: order.id,
          weekday,
          hour: subHour,
        });
        runs.push(created.nextRunAt);
      }
      setSubscribed([...runs].sort()[0] ?? null);
    } catch {
      setSubscribing(false);
    }
  };
  // Cross-bazaar siblings: the other stalls of the same trip.
  const [siblings, setSiblings] = useState<{ id: string; number: string }[]>([]);
  useEffect(() => {
    if (!order?.groupId) return;
    api()
      .orders.list({ pageSize: 10, search: '' })
      .then((page) =>
        setSiblings(
          page.items
            .filter((row) => row.groupId === order.groupId && row.id !== order.id)
            .map((row) => ({ id: row.id, number: row.number })),
        ),
      )
      .catch(() => undefined);
  }, [order?.id, order?.groupId]);
  const reportFreshness = async () => {
    if (!order || !complaint.trim()) return;
    setComplaining(true);
    try {
      const ticket = await api().support.create({
        topic: 'ORDER_ISSUE',
        subject: `${t('rules.freshness.title')} · ${order.number}`,
        body: complaint.trim(),
        orderId: order.id,
      });
      setComplaintSent(ticket.number);
    } catch {
      setComplaining(false);
    }
  };
  const quantities = useCartQuantities();
  const { replace: replaceCart } = useCartActions();
  const router = useRouter();

  // "Повторить": the same lines land on the cart and the customer is at checkout.
  const repeat = () => {
    if (!order) return;
    replaceCart(repeatQuantities(order.items, quantities));
    router.push(`/${locale}/checkout?store=${order.storeId}`);
  };

  // The Telegram bot's "Повторить" button lands here with ?repeat=1.
  const wantsRepeat = useSearchParams().get('repeat') === '1';
  const repeated = useRef(false);
  useEffect(() => {
    if (!wantsRepeat || !order || repeated.current) return;
    repeated.current = true;
    repeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsRepeat, order]);

  const markers = useMemo(() => {
    if (!order) return [];
    const done = order.status === ORDER_STATUS.DELIVERED;
    return [
      ...(order.store.point
        ? [
            {
              id: 'store',
              point: order.store.point,
              kind: 'store' as const,
              label: tr(order.store.name, locale),
            },
          ]
        : []),
      ...(order.address.point
        ? [{ id: 'home', point: order.address.point, kind: 'home' as const }]
        : []),
      ...(courier && !done ? [{ id: 'courier', point: courier, kind: 'courier' as const }] : []),
    ];
  }, [order, courier, locale]);

  if (!order) {
    return (
      <GoShell
        locale={locale}
        back={`/${locale}/orders`}
        expanded
        map={{ center: DEFAULT_POINT, zoom: 12, interactive: false }}
        header={
          <h1 className="font-display text-[22px] font-extrabold leading-7">{t('order.title')}</h1>
        }
      >
        <p className="mt-4 text-ink-muted">
          {!authReady || !ready ? (
            t('common.loading')
          ) : !user ? (
            <Link
              href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/orders/${orderId}`)}`}
              className="underline"
            >
              {t('order.signIn')}
            </Link>
          ) : (
            t('order.notFound')
          )}
        </p>
      </GoShell>
    );
  }

  const status = order.status;
  const text = orderStatusText(locale)[status];
  const terminal = isTerminalOrderStatus(status);
  const steps = orderSteps(locale);
  const stepIndex = steps.findIndex((step) => step.statuses.includes(status));
  const failed = status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.FAILED;

  const payDue = onlinePaymentDue(order);
  const weighed = order.items.some((item) => item.actualQuantity !== null);
  const home = order.address.point ?? order.store.point ?? DEFAULT_POINT;
  const stall = order.store.point ?? home;
  const span = haversineMeters(stall, home);
  // Follow the courier while there is one; otherwise show the whole trip.
  const center =
    courier && !terminal
      ? courier
      : { lat: (stall.lat + home.lat) / 2, lng: (stall.lng + home.lng) / 2 };
  const zoom = courier && !terminal ? 14 : span > 6000 ? 11 : span > 3000 ? 12 : 13;

  return (
    <GoShell
      locale={locale}
      back={`/${locale}`}
      peek={0.42}
      map={{ center, zoom, markers, interactive: true }}
      header={
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-start gap-2 font-display text-xl font-extrabold leading-6 [text-wrap:balance]">
                {!terminal ? (
                  <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
                  </span>
                ) : null}
                <span>{text.title}</span>
              </h1>
              <p className="mt-0.5 text-sm text-ink-muted">{text.hint}</p>
            </div>
            {order.scheduledFor && !courier && !terminal ? (
              <span className="shrink-0 rounded-2xl bg-saffron-100 px-3 py-1.5 text-right">
                <span className="block font-display text-base font-extrabold leading-6">
                  {slotLabel(order.scheduledFor, locale)}
                </span>
                <span className="block text-[11px] text-ink-muted">{t('order.window')}</span>
              </span>
            ) : etaMinutes && !terminal ? (
              <span className="shrink-0 rounded-2xl bg-saffron-100 px-3 py-1.5 text-right">
                <span className="block font-display text-lg font-extrabold leading-6 tabular-nums">
                  {t('common.eta', { minutes: etaMinutes })}
                </span>
                <span className="block text-[11px] text-ink-muted">{t('order.toDoor')}</span>
              </span>
            ) : null}
          </div>

          {failed ? null : (
            <ol className="mt-5 flex" aria-label={t('order.steps')}>
              {steps.map((step, index) => (
                <li
                  key={step.label}
                  className="tile-step"
                  data-state={
                    index < stepIndex || (index === stepIndex && terminal)
                      ? 'done'
                      : index === stepIndex
                        ? 'active'
                        : 'todo'
                  }
                  aria-current={index === stepIndex ? 'step' : undefined}
                >
                  <span className="tile-step__tile" />
                  <span
                    className={`text-[11px] ${index <= stepIndex ? 'font-medium text-ink' : 'text-ink-muted'}`}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      }
      footer={
        terminal ? (
          <button type="button" className="btn-go" onClick={repeat}>
            {t('order.repeat')}
          </button>
        ) : undefined
      }
    >
      {courierInfo && !terminal ? (
        <section className="mt-3 flex items-center gap-3 rounded-2xl bg-sand-50 p-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white"
            aria-hidden
          >
            {courierInfo.firstName[0]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium">{courierInfo.firstName}</span>
            <span className="block text-sm text-ink-muted">
              ★ {courierInfo.rating.toFixed(1)} ·{' '}
              {courierInfo.neighbour
                ? t('order.neighbour')
                : VEHICLES.includes(courierInfo.vehicleType)
                  ? t(`order.vehicle.${courierInfo.vehicleType}` as MessageKey)
                  : courierInfo.vehicleType}
            </span>
          </span>
          <a
            href={`tel:${courierInfo.phone.replace(/[^\d+]/g, '')}`}
            className="go-fab bg-surface-raise shadow-none"
            aria-label={t('order.call')}
          >
            <Phone />
          </a>
          <button
            type="button"
            onClick={() => setChat((v) => !v)}
            className="go-fab bg-surface-raise shadow-none"
            aria-label={t('order.chat')}
            aria-pressed={chat}
          >
            <Chat />
          </button>
        </section>
      ) : null}
      {chat && courierInfo && !terminal ? (
        <OrderChat orderId={order.id} locale={locale} onClose={() => setChat(false)} />
      ) : null}

      {payDue === 'due' ? (
        <section className="mt-3 rounded-2xl bg-saffron-100 p-3">
          <p className="text-sm font-medium">
            {t('order.payNow', { amount: t.money(order.totals.total.amount) })}
          </p>
          <div className="mt-2 flex gap-2">
            {ONLINE_PROVIDERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="btn-go h-11 flex-1"
                onClick={() => {
                  void startOnlinePayment(api(), order.id, option.id, window.location.href).then(
                    (url) => {
                      if (url) window.location.assign(url);
                    },
                  );
                }}
              >
                {option.title}
              </button>
            ))}
          </div>
        </section>
      ) : payDue === 'waiting' ? (
        <p className="mt-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm text-ink-muted">
          {t('order.payLater')}
        </p>
      ) : null}

      {terminal ? (
        <div className="mt-3 rounded-2xl bg-sand-50 p-3 text-sm">
          {subscribed ? (
            <p className="text-ink-muted">
              {t('subs.subscribed', { when: slotLabel(subscribed, locale) })}
            </p>
          ) : !subscribing ? (
            <button type="button" className="block text-left" onClick={() => setSubscribing(true)}>
              <span className="block font-medium text-brand-700">{t('subs.repeatWeekly')}</span>
              <span className="block text-xs text-ink-muted">{t('subs.intro')}</span>
            </button>
          ) : (
            <>
              <p className="text-xs text-ink-muted">{t('subs.pickDay')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {WEEKDAY_ORDER.map((day) => (
                  <button
                    key={day}
                    type="button"
                    className="go-chip h-9"
                    aria-pressed={subWeekday === day}
                    onClick={() => setSubWeekday(day)}
                  >
                    {t(`weekday.${day}` as MessageKey)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-muted">{t('subs.pickTime')}</p>
              <div className="mt-1 flex gap-1.5">
                {SLOT_HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    className="go-chip h-9"
                    aria-pressed={subHour === hour}
                    onClick={() => setSubHour(hour)}
                  >
                    {slotTime(hour)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-go-secondary mt-3 h-11"
                onClick={() => void subscribe()}
              >
                {t('subs.subscribe')}
              </button>
              <button
                type="button"
                className="mt-2 block w-full text-center text-sm font-medium text-brand-700"
                onClick={() => void subscribe([1, 2, 3, 4, 5, 6])}
              >
                {t('order.repeatDaily')}
              </button>
            </>
          )}
        </div>
      ) : null}

      {status === ORDER_STATUS.DELIVERED ? <AfterDelivery order={order} locale={locale} /> : null}

      {status === ORDER_STATUS.DELIVERED && lateRefundDue(order) ? (
        <p className="mt-3 rounded-2xl bg-saffron-100 px-4 py-3 text-sm">
          {t('order.late', {
            minutes: lateMinutes(order),
            amount: t.money(order.totals.deliveryFee.amount),
          })}
        </p>
      ) : null}
      {status === ORDER_STATUS.DELIVERED && freshnessOpen(order) ? (
        <div className="mt-3 rounded-2xl bg-sand-50 p-3 text-sm">
          {complaintSent ? (
            <p className="text-ink-muted">{t('order.freshnessSent', { number: complaintSent })}</p>
          ) : (
            <>
              <p className="text-ink-muted">
                {t('order.freshness', {
                  time:
                    freshnessDeadline(order)?.toLocaleTimeString(
                      locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU',
                      { hour: '2-digit', minute: '2-digit' },
                    ) ?? '',
                })}
              </p>
              <input
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                className="go-field mt-2 h-11"
                placeholder={t('order.freshnessPlaceholder')}
              />
              <button
                type="button"
                className="btn-go-secondary mt-2 h-11"
                disabled={!complaint.trim() || complaining}
                onClick={() => void reportFreshness()}
              >
                {t('order.freshnessReport')}
              </button>
            </>
          )}
        </div>
      ) : null}

      {status === ORDER_STATUS.COURIER_ARRIVED ? (
        <p className="mt-3 rounded-2xl bg-saffron-100 px-4 py-3 text-sm">
          {t('order.arrived', {
            entrance: order.address.entrance ? ` ${order.address.entrance}` : '',
          })}
        </p>
      ) : null}

      <div className="go-row -mx-3 mt-3 cursor-default hover:bg-transparent">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saffron-100 text-saffron-600"
          aria-hidden
        >
          <HomeGlyph />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink-muted">{t('order.where')}</span>
          <span className="block truncate text-sm">{order.address.formatted}</span>
          {order.recipientPhone ? (
            <span className="block truncate text-xs text-ink-muted">
              {t('order.recipient', { name: order.recipientName || order.recipientPhone })}
              {order.recipientName ? ` · ${order.recipientPhone}` : ''}
            </span>
          ) : null}
        </span>
      </div>
      {order.paymentMethod === 'INVOICE' ? (
        <p className="mt-1 flex items-center justify-between px-3 text-xs text-ink-muted">
          <span>
            {order.dueAt ? t('order.invoiceDue', { date: t.date(order.dueAt) }) : ''} ·{' '}
            {paymentStatusText(locale)[order.paymentStatus]}
          </span>
          <Link href={`/${locale}/orders/${order.id}/invoice`} className="underline">
            {t('order.invoice')}
          </Link>
        </p>
      ) : null}
      {siblings.length > 0 ? (
        <p className="mt-1 px-3 text-xs text-ink-muted">
          {siblings.map((sibling) => (
            <Link key={sibling.id} href={`/${locale}/orders/${sibling.id}`} className="underline">
              {t('order.group', { number: sibling.number })}
            </Link>
          ))}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        className="go-row -mx-3"
        aria-expanded={details}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-ink-muted"
          aria-hidden
        >
          <Receipt />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink-muted">
            {t('order.number', { number: order.number })}
          </span>
          <span className="block truncate text-sm">
            {tr(order.store.name, locale)} · {t.money(order.totals.total.amount)} ·{' '}
            {paymentMethodText(locale)[order.paymentMethod].title}
            {order.paymentMethod === 'ONLINE'
              ? ` · ${paymentStatusText(locale)[order.paymentStatus]}`
              : ''}
          </span>
        </span>
        <span className={`transition-transform ${details ? 'rotate-90' : ''}`}>
          <Chevron />
        </span>
      </button>

      {details ? (
        <div className="mt-1 rounded-2xl bg-sand-50 p-3 text-sm">
          <ul className="divide-y divide-line">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2">
                {item.weighingPhotoUrl ? (
                  <a
                    href={item.weighingPhotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-sand-100"
                    aria-label={t('order.photo')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.weighingPhotoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </a>
                ) : null}
                <span className="min-w-0 flex-1 truncate">
                  {tr(item.name, locale)}{' '}
                  <span className="text-ink-muted">
                    × {item.actualQuantity ?? item.quantity} {unitLabel(locale)[item.unit]}
                    {item.actualQuantity !== null && item.actualQuantity !== item.quantity
                      ? t('order.ordered', { quantity: item.quantity })
                      : ''}
                  </span>
                </span>
                <span className="shrink-0">{t.money((item.actualTotal ?? item.total).amount)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-2 space-y-1 border-t border-line pt-2">
            <div className="flex justify-between text-ink-muted">
              <dt>{t('order.goods')}</dt>
              <dd>{t.money(order.totals.subtotal.amount)}</dd>
            </div>
            <div className="flex justify-between text-ink-muted">
              <dt>{t('order.delivery')}</dt>
              <dd>{t.money(order.totals.deliveryFee.amount)}</dd>
            </div>
            {order.totals.serviceFee.amount > 0 ? (
              <div className="flex justify-between text-ink-muted">
                <dt>{t('order.serviceFee')}</dt>
                <dd>{t.money(order.totals.serviceFee.amount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between font-bold">
              <dt>{weighed ? t('order.totalWeighed') : t('order.total')}</dt>
              <dd>{t.money(order.totals.total.amount)}</dd>
            </div>
          </dl>
          {order.comment ? (
            <p className="mt-2 whitespace-pre-line text-ink-muted">{order.comment}</p>
          ) : null}
        </div>
      ) : null}

      {cancellable ? (
        <div className="mt-4 flex items-center justify-center gap-3 pb-2 text-sm">
          {confirming ? (
            <>
              <span className="text-ink-muted">{t('order.cancelQ')}</span>
              <button
                type="button"
                disabled={cancelling}
                className="rounded-lg px-2 py-1 font-medium text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                onClick={async () => {
                  setCancelling(true);
                  await cancel(t('order.cancelReason')).catch(() => undefined);
                  setCancelling(false);
                  setConfirming(false);
                }}
              >
                {cancelling ? t('order.cancelling') : t('order.cancelYes')}
              </button>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                onClick={() => setConfirming(false)}
              >
                {t('order.keep')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              onClick={() => setConfirming(true)}
            >
              {t('order.cancel')}
            </button>
          )}
        </div>
      ) : null}
    </GoShell>
  );
}
