/**
 * The waiting screen as paper over the live map: status and the tile steps on
 * the dark scrim, the map showing through, then the courier's slip and the
 * receipt. Everything here is the API's order and the tracking room; the
 * logic is the old screen's.
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
import { ArrowLeft, Chat, HomeGlyph, Phone } from '@/components/go/icons';
import { OrderChat } from '@/components/go/order-chat';
import { MapView } from '@/components/map/map-view';
import { DEFAULT_POINT } from '@/features/address';
import { useAuth } from '@/features/auth';
import { useCartActions, useCartQuantities } from '@/features/cart';
import { useLiveOrder } from '@/features/orders';
import { api } from '@/lib/api';

import s from './bazar.module.css';

const VEHICLES = ['FOOT', 'BICYCLE', 'SCOOTER', 'MOTORBIKE', 'CAR', 'VAN'];

export function BazaarOrder({ orderId, locale }: { orderId: string; locale: string }) {
  const t = createT(locale);
  const { user, ready: authReady } = useAuth();
  const { order, courier, courierInfo, etaMinutes, cancellable, ready, cancel } =
    useLiveOrder(orderId);
  const [confirming, setConfirming] = useState(false);
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

  const back = `/${locale}/orders`;

  if (!order) {
    return (
      <main className={s.scene}>
        <div className={`${s.body} ${s.narrow}`}>
          <div className={s.top}>
            <Link href={back} className={s.round} aria-label={t('common.back')}>
              <ArrowLeft />
            </Link>
          </div>
          <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 26px' }}>
            <h1 className={s.display} style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>
              {t('order.title')}
            </h1>
            <p
              className={s.hand}
              style={{ fontSize: 24, margin: '6px 0 0', color: 'var(--cream-muted)' }}
            >
              {!authReady || !ready ? (
                t('common.loading')
              ) : !user ? (
                <Link
                  href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/orders/${orderId}`)}`}
                  style={{ color: 'inherit' }}
                >
                  {t('order.signIn')} →
                </Link>
              ) : (
                t('order.notFound')
              )}
            </p>
          </div>
        </div>
      </main>
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
  const units = unitLabel(locale);
  const placed = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  }).format(new Date(order.placedAt));
  const chip = (on: boolean) => `${s.chipPaper} ${on ? s.chipPaperOn : ''}`;

  return (
    <main className={s.scene}>
      {/* The map is the ground while the order is on its way; a dark scrim keeps the paper readable. */}
      <div className={`${s.mapGround} ${terminal ? s.mapGroundDone : ''}`}>
        <MapView center={center} zoom={zoom} markers={markers} interactive />
      </div>
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={back} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{t('order.number', { number: order.number })}</span>
        </div>

        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 18px' }}>
          <div className={s.eyebrow}>{placed}</div>
          <h1 className={s.display} style={{ fontSize: 'clamp(32px, 4.6vw, 52px)' }}>
            {text.title}
          </h1>
          <p
            className={s.hand}
            style={{ fontSize: 22, margin: '6px 0 0', color: 'var(--cream-muted)' }}
          >
            {text.hint}
          </p>
          {order.scheduledFor && !courier && !terminal ? (
            <span className={s.tag} style={{ marginTop: 12 }}>
              {slotLabel(order.scheduledFor, locale)} · {t('order.window')}
            </span>
          ) : etaMinutes && !terminal ? (
            <span className={s.tag} style={{ marginTop: 12 }}>
              {t('common.eta', { minutes: etaMinutes })} · {t('order.toDoor')}
            </span>
          ) : null}
          {failed ? null : (
            <ol className={s.steps} aria-label={t('order.steps')}>
              {steps.map((step, index) => {
                const state =
                  index < stepIndex || (index === stepIndex && terminal)
                    ? 'done'
                    : index === stepIndex
                      ? 'active'
                      : 'todo';
                return (
                  <li
                    key={step.label}
                    className={s.step}
                    data-state={state}
                    aria-current={index === stepIndex ? 'step' : undefined}
                  >
                    <span className={s.stepTile} />
                    <span className={s.stepLabel}>{step.label}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Room for the map to show through while the courier is out. */}
        {!terminal ? <div className={s.mapWindow} /> : null}

        {courierInfo && !terminal ? (
          <section className={s.receipt}>
            <div className={s.rcVendor} style={{ margin: 0 }}>
              <span className={`${s.avatar} ${s.avatarSmall}`}>{courierInfo.firstName[0]}</span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className={s.rcVendorName}>{courierInfo.firstName}</span>
                <span className={s.rcVendorMeta}>
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
                className={s.payIcon}
                aria-label={t('order.call')}
              >
                <Phone />
              </a>
              <button
                type="button"
                onClick={() => setChat((v) => !v)}
                className={`${s.payIcon} ${chat ? s.payIconOn : ''}`}
                aria-label={t('order.chat')}
                aria-pressed={chat}
              >
                <Chat />
              </button>
            </div>
            {chat ? (
              <OrderChat orderId={order.id} locale={locale} onClose={() => setChat(false)} />
            ) : null}
          </section>
        ) : null}

        {payDue === 'due' ? (
          <section className={s.receipt}>
            <p className={s.rcName}>
              {t('order.payNow', { amount: t.money(order.totals.total.amount) })}
            </p>
            <div className={s.chips}>
              {ONLINE_PROVIDERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={s.rcCta}
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
        ) : null}
        {status === ORDER_STATUS.COURIER_ARRIVED ? (
          <p className={s.notice}>
            {t('order.arrived', {
              entrance: order.address.entrance ? ` ${order.address.entrance}` : '',
            })}
          </p>
        ) : null}
        {status === ORDER_STATUS.DELIVERED && lateRefundDue(order) ? (
          <p className={s.notice}>
            {t('order.late', {
              minutes: lateMinutes(order),
              amount: t.money(order.totals.deliveryFee.amount),
            })}
          </p>
        ) : null}

        <section className={s.receipt}>
          <div className={s.rcHead}>
            <span className={s.rcTitle}>{t('receipt.title')}</span>
            <span className={s.rcDate}>
              {paymentMethodText(locale)[order.paymentMethod].title}
              {order.paymentMethod === 'ONLINE'
                ? ` · ${paymentStatusText(locale)[order.paymentStatus]}`
                : ''}
            </span>
          </div>
          <div className={s.rcVendor} style={{ cursor: 'default' }}>
            <span
              className={`${s.avatar} ${s.avatarSmall}`}
              style={{ background: 'var(--kraft)', color: 'var(--pomegranate)' }}
            >
              <HomeGlyph />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className={s.rcVendorMeta}>{t('order.where')}</span>
              <span className={s.rcVendorName} style={{ fontSize: 18 }}>
                {order.address.formatted}
              </span>
              {order.recipientPhone ? (
                <span className={s.rcVendorMeta}>
                  {t('order.recipient', { name: order.recipientName || order.recipientPhone })}
                  {order.recipientName ? ` · ${order.recipientPhone}` : ''}
                </span>
              ) : null}
            </span>
          </div>
          {payDue === 'waiting' ? <p className={s.rcHint}>{t('order.payLater')}</p> : null}
          {order.paymentMethod === 'INVOICE' ? (
            <p className={s.rcHint}>
              {order.dueAt ? t('order.invoiceDue', { date: t.date(order.dueAt) }) : ''} ·{' '}
              {paymentStatusText(locale)[order.paymentStatus]} ·{' '}
              <Link href={`/${locale}/orders/${order.id}/invoice`} className={s.rcLink}>
                {t('order.invoice')}
              </Link>
            </p>
          ) : null}
          {siblings.map((sibling) => (
            <p key={sibling.id} className={s.rcHint}>
              <Link href={`/${locale}/orders/${sibling.id}`} className={s.rcLink}>
                {t('order.group', { number: sibling.number })}
              </Link>
            </p>
          ))}

          <div className={s.rcSection}>{tr(order.store.name, locale)}</div>
          <ul className={s.rcLines}>
            {order.items.map((item) => (
              <li
                key={item.id}
                className={s.rcLine}
                style={{ alignItems: 'center', padding: '10px 0' }}
              >
                {item.weighingPhotoUrl ? (
                  <a
                    href={item.weighingPhotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={s.thumb}
                    style={{
                      backgroundImage: `url(${item.weighingPhotoUrl})`,
                      width: 44,
                      height: 44,
                    }}
                    aria-label={t('order.photo')}
                  />
                ) : null}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className={s.rcName} style={{ fontSize: 17 }}>
                    {tr(item.name, locale)}
                  </span>
                  <span className={s.rcUnit}>
                    {t.qty(item.actualQuantity ?? item.quantity)} {units[item.unit]}
                    {item.actualQuantity !== null && item.actualQuantity !== item.quantity
                      ? t('order.ordered', { quantity: item.quantity })
                      : ''}
                  </span>
                </span>
                <span className={s.rcSum} style={{ fontSize: 22, paddingTop: 0 }}>
                  {t.money((item.actualTotal ?? item.total).amount)}
                </span>
              </li>
            ))}
          </ul>
          <dl className={s.rcTotals}>
            <div className={s.rcRow}>
              <dt>{t('order.goods')}</dt>
              <dd>{t.money(order.totals.subtotal.amount)}</dd>
            </div>
            <div className={s.rcRow}>
              <dt>{t('order.delivery')}</dt>
              <dd>{t.money(order.totals.deliveryFee.amount)}</dd>
            </div>
            {order.totals.serviceFee.amount > 0 ? (
              <div className={s.rcRow}>
                <dt>{t('order.serviceFee')}</dt>
                <dd>{t.money(order.totals.serviceFee.amount)}</dd>
              </div>
            ) : null}
            <div className={`${s.rcRow} ${s.rcRowStrong}`}>
              <dt>{weighed ? t('order.totalWeighed') : t('order.total')}</dt>
              <dd>{t.money(order.totals.total.amount)}</dd>
            </div>
          </dl>
          {weighed ? <span className={s.stamp}>{t('receipt.weighed')}</span> : null}
          {order.comment ? <p className={`${s.rcHint} ${s.rcPre}`}>{order.comment}</p> : null}

          {cancellable ? (
            <div className={s.rcActions} style={{ justifyContent: 'center' }}>
              {confirming ? (
                <>
                  <span className={s.rcHint} style={{ margin: 0 }}>
                    {t('order.cancelQ')}
                  </span>
                  <button
                    type="button"
                    disabled={cancelling}
                    className={s.rcLink}
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
                    className={s.rcLink}
                    style={{ color: '#7a6749' }}
                    onClick={() => setConfirming(false)}
                  >
                    {t('order.keep')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={s.rcLink}
                  style={{ color: '#7a6749' }}
                  onClick={() => setConfirming(true)}
                >
                  {t('order.cancel')}
                </button>
              )}
            </div>
          ) : null}
        </section>

        {status === ORDER_STATUS.DELIVERED ? (
          <section className={s.receipt}>
            <AfterDelivery order={order} locale={locale} />
          </section>
        ) : null}

        {status === ORDER_STATUS.DELIVERED && freshnessOpen(order) ? (
          <section className={s.receipt}>
            {complaintSent ? (
              <p className={s.rcName}>{t('order.freshnessSent', { number: complaintSent })}</p>
            ) : (
              <>
                <p className={s.rcName}>
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
                  className={s.field}
                  placeholder={t('order.freshnessPlaceholder')}
                />
                <div className={s.rcActions}>
                  <button
                    type="button"
                    className={s.rcCta}
                    disabled={!complaint.trim() || complaining}
                    onClick={() => void reportFreshness()}
                  >
                    {t('order.freshnessReport')}
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}

        {terminal ? (
          <section className={s.receipt}>
            {subscribed ? (
              <p className={s.rcName}>
                {t('subs.subscribed', { when: slotLabel(subscribed, locale) })}
              </p>
            ) : !subscribing ? (
              <button
                type="button"
                className={s.payRow}
                style={{ borderTop: 0, padding: 0 }}
                onClick={() => setSubscribing(true)}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className={s.rcName}>{t('subs.repeatWeekly')}</span>
                  <span className={s.rcUnit}>{t('subs.intro')}</span>
                </span>
                <span className={s.checkoutArrow} style={{ color: 'var(--pomegranate)' }}>
                  →
                </span>
              </button>
            ) : (
              <>
                <p className={s.rcHint} style={{ margin: 0 }}>
                  {t('subs.pickDay')}
                </p>
                <div className={s.chips}>
                  {WEEKDAY_ORDER.map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={chip(subWeekday === day)}
                      onClick={() => setSubWeekday(day)}
                    >
                      {t(`weekday.${day}` as MessageKey)}
                    </button>
                  ))}
                </div>
                <p className={s.rcHint}>{t('subs.pickTime')}</p>
                <div className={s.chips}>
                  {SLOT_HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      className={chip(subHour === hour)}
                      onClick={() => setSubHour(hour)}
                    >
                      {slotTime(hour)}
                    </button>
                  ))}
                </div>
                <div className={s.rcActions}>
                  <button type="button" className={s.rcCta} onClick={() => void subscribe()}>
                    {t('subs.subscribe')}
                  </button>
                  <button
                    type="button"
                    className={s.rcLink}
                    onClick={() => void subscribe([1, 2, 3, 4, 5, 6])}
                  >
                    {t('order.repeatDaily')}
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}
      </div>

      {terminal ? (
        <div className={s.bar}>
          <div className={s.barInner}>
            <button type="button" className={s.checkout} onClick={repeat}>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <div className={s.checkoutTitle}>{t('order.repeat')}</div>
                <div className={s.checkoutSub}>
                  {tr(order.store.name, locale)} · {t.money(order.totals.subtotal.amount)}
                </div>
              </span>
              <span className={s.checkoutArrow}>→</span>
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
