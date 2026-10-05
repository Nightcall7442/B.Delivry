/**
 * The waiting screen: courier on the map, status and tile progress in the
 * sheet. Everything here is the API's order and the tracking room — the same
 * layout for every status, only the words, the tiles and the buttons change.
 */
import { ORDER_STATUS, isTerminalOrderStatus } from '@bazar/constants';
import { haversineMeters } from '@bazar/maps';
import {
  ONLINE_PROVIDERS,
  SLOT_HOURS,
  WEEKDAY_ORDER,
  alpha,
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
  addressLabel,
} from '@bazar/storefront';
import type { MessageKey } from '@bazar/i18n';
import type { CourierPublicDto, LatLngDto, OrderDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import {
  Button,
  Chat,
  Chevron,
  Chip,
  Field,
  Home,
  Line,
  OrderChat,
  Panel,
  Phone,
  Photo,
  Receipt,
  Row,
  Text,
  api,
  color,
  font,
  radius,
  scale,
  useAuth,
  useLocale,
  useT,
  isDark,
} from '@bazar/mobile';
import { scene, sceneFont } from '@/components/bazar';
import { AfterDelivery } from '@/components/order/AfterDelivery';
import { Shell } from '@/components/ui/Shell';

import { DEFAULT_POINT } from '@/features/address/store';
import { useCartActions, useCartQuantities } from '@/features/cart/store';
import { useLiveOrder } from '@/features/orders/store';

const VEHICLES = ['FOOT', 'BICYCLE', 'SCOOTER', 'MOTORBIKE', 'CAR', 'VAN'];

const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'http://localhost:3000';

/** The order slip lives on the theme's kraft, the map under it gets a warm wash of the same. */
const KRAFT = color.field;
const KRAFT_TINT = alpha(color.field, isDark ? 0.55 : 0.42);
const pct = (value: number) => `${value}%` as const;

export function OrderScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { user, ready: authReady } = useAuth();
  const t = useT();
  const { order, courier, courierInfo, etaMinutes, cancellable, ready, cancel } =
    useLiveOrder(orderId);

  if (!order) {
    return (
      <Shell
        back="/orders"
        expanded
        ground={KRAFT}
        tint={KRAFT_TINT}
        map={{ center: DEFAULT_POINT, zoom: 12, interactive: false }}
        header={<Text role="display">{t('order.title')}</Text>}
      >
        {!authReady || !ready ? (
          <Text role="muted" style={{ marginTop: 16 }}>
            {t('common.loading')}
          </Text>
        ) : !user ? (
          <Pressable
            onPress={() =>
              router.replace({ pathname: '/login', params: { next: `/order/${orderId}` } })
            }
          >
            <Text role="muted" style={{ marginTop: 16, textDecorationLine: 'underline' }}>
              {t('order.signIn')}
            </Text>
          </Pressable>
        ) : (
          <Text role="muted" style={{ marginTop: 16 }}>
            {t('order.notFound')}
          </Text>
        )}
      </Shell>
    );
  }

  return (
    <OrderSheet
      order={order}
      courier={courier}
      courierInfo={courierInfo}
      eta={etaMinutes}
      cancellable={cancellable}
      onCancel={() => void cancel(t('order.cancelReason')).catch(() => undefined)}
    />
  );
}

function OrderSheet({
  order,
  courier,
  courierInfo,
  eta,
  cancellable,
  onCancel,
}: {
  order: OrderDto;
  courier: LatLngDto | null;
  courierInfo: CourierPublicDto | null;
  eta: number | null;
  cancellable: boolean;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { locale, t } = useLocale();
  const [details, setDetails] = useState(false);
  const [chat, setChat] = useState(false);
  const quantities = useCartQuantities();
  const { replace: replaceCart } = useCartActions();
  const status = order.status;

  // "Повторить": the same lines land on the cart and the customer is at checkout.
  const repeat = () => {
    replaceCart(repeatQuantities(order.items, quantities));
    router.push({ pathname: '/checkout', params: { store: order.storeId } });
  };
  const payDue = onlinePaymentDue(order);
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
  const reportFreshness = async () => {
    if (!complaint.trim()) return;
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
  const weighed = order.items.some((item) => item.actualQuantity !== null);
  const text = orderStatusText(locale)[status];
  const terminal = isTerminalOrderStatus(status);
  const story = [...order.statusHistory].sort((a, b) => a.at.localeCompare(b.at));
  const weighedItems = order.items.filter((item) => item.weighingPhotoUrl);
  const steps = orderSteps(locale);
  const stepIndex = steps.findIndex((step) => step.statuses.includes(status));
  const hasCourier = courierInfo !== null && !terminal;
  const failed = status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.FAILED;

  const home = order.address.point ?? order.store.point ?? DEFAULT_POINT;
  const stall = order.store.point ?? home;
  const markers = useMemo(
    () => [
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
      ...(courier && status !== ORDER_STATUS.DELIVERED
        ? [{ id: 'courier', point: courier, kind: 'courier' as const }]
        : []),
    ],
    [order, courier, status, locale],
  );
  const center =
    courier && !terminal
      ? courier
      : { lat: (stall.lat + home.lat) / 2, lng: (stall.lng + home.lng) / 2 };
  const span = haversineMeters(stall, home);
  // Follow the courier while there is one; once it is over, show the whole trip.
  const zoom = courier && !terminal ? 14 : span > 6000 ? 11 : span > 3000 ? 12 : 13;

  return (
    <Shell
      back="/"
      peek={0.42}
      ground={KRAFT}
      tint={KRAFT_TINT}
      map={{ center, zoom, markers, interactive: true }}
      header={
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                {!terminal ? <Pulse /> : null}
                <Text role="display" style={s.status}>
                  {text.title}
                </Text>
              </View>
              <Text role="muted" style={s.hint}>
                {text.hint}
              </Text>
            </View>
            {order.scheduledFor && !courier && !terminal ? (
              <View style={s.eta}>
                <RNText style={[s.etaValue, s.etaSlot]}>
                  {slotLabel(order.scheduledFor, locale)}
                </RNText>
                <Text role="caption">{t('order.window')}</Text>
              </View>
            ) : eta && !terminal ? (
              <View style={s.eta}>
                <RNText style={s.etaValue}>{t('common.eta', { minutes: eta })}</RNText>
                <Text role="caption">{t('order.toDoor')}</Text>
              </View>
            ) : null}
          </View>

          {failed ? null : (
            <View style={s.steps}>
              {/* One thread from the first stop's centre to the last, the walked part in
                  pomegranate, under the stops (rotated bordered tiles split into crescents on
                  Android). */}
              <View
                style={[s.thread, { left: pct(50 / steps.length), right: pct(50 / steps.length) }]}
              >
                <View
                  style={[
                    s.walked,
                    { width: pct((Math.max(stepIndex, 0) / (steps.length - 1)) * 100) },
                  ]}
                />
              </View>
              {steps.map((step, index) => {
                const state =
                  index < stepIndex || (index === stepIndex && terminal)
                    ? 'done'
                    : index === stepIndex
                      ? 'active'
                      : 'todo';
                return (
                  <View key={step.label} style={s.step}>
                    <View style={s.stopRow}>
                      <View
                        style={[
                          s.stop,
                          state === 'done' && s.stopDone,
                          state === 'active' && s.stopActive,
                        ]}
                      />
                    </View>
                    <Text
                      role="caption"
                      style={
                        state === 'todo'
                          ? { color: color.inkMuted }
                          : { color: color.ink, fontWeight: '500' }
                      }
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      }
      footer={terminal ? <Button label={t('order.repeat')} onPress={repeat} /> : undefined}
    >
      {hasCourier && courierInfo ? (
        <Panel style={[s.courier, s.paper]}>
          <View style={s.avatar}>
            <RNText style={s.avatarText}>{courierInfo.firstName[0]}</RNText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text role="body" style={{ fontWeight: '500' }}>
              {courierInfo.firstName}
            </Text>
            <Text role="muted">
              ★ {courierInfo.rating.toFixed(1)} ·{' '}
              {courierInfo.neighbour
                ? t('order.neighbour')
                : VEHICLES.includes(courierInfo.vehicleType)
                  ? t(`order.vehicle.${courierInfo.vehicleType}` as MessageKey)
                  : courierInfo.vehicleType}
            </Text>
          </View>
          <Pressable
            onPress={() => Linking.openURL(`tel:${courierInfo.phone.replace(/[^\d+]/g, '')}`)}
            style={s.action}
          >
            <Phone />
          </Pressable>
          <Pressable onPress={() => setChat((v) => !v)} style={s.action}>
            <Chat />
          </Pressable>
        </Panel>
      ) : null}
      {chat && hasCourier ? (
        <View style={{ marginTop: 12 }}>
          <OrderChat orderId={order.id} me="CUSTOMER" onClose={() => setChat(false)} />
        </View>
      ) : null}

      {story.length > 0 ? (
        <Panel style={[s.paper, { marginTop: 12, padding: 14 }]}>
          <Text role="title" style={{ marginBottom: 10 }}>
            {t('order.story')}
          </Text>
          {story.map((entry, index) => {
            const last = index === story.length - 1;
            const photos = entry.status === 'PICKED_UP' ? weighedItems : [];
            return (
              <View key={`${entry.status}-${entry.at}`} style={s.storyRow}>
                <View style={s.storyRail}>
                  <View
                    style={[
                      s.storyDot,
                      last && !terminal && s.storyDotLive,
                      last && terminal && failed && { backgroundColor: color.danger },
                    ]}
                  />
                  {!last ? <View style={s.storyLine} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text
                      role="body"
                      numberOfLines={2}
                      style={{ flex: 1, fontWeight: last ? '600' : '500', ...scale.body }}
                    >
                      {orderStatusText(locale)[entry.status].title}
                    </Text>
                    <Text role="caption" style={{ fontVariant: ['tabular-nums'] }}>
                      {new Date(entry.at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  {photos.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginTop: 8 }}
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {photos.map((item) => (
                        <Pressable
                          key={item.id}
                          onPress={() => Linking.openURL(item.weighingPhotoUrl ?? '')}
                          style={s.storyPhoto}
                        >
                          <Photo uri={item.weighingPhotoUrl} style={StyleSheet.absoluteFill} />
                          <View style={s.storyPhotoTag}>
                            <Text role="caption" numberOfLines={1} style={s.storyPhotoText}>
                              {t('order.weighedAs', {
                                quantity: t.qty(item.actualQuantity ?? item.quantity),
                                unit: unitLabel(locale)[item.unit],
                              })}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Panel>
      ) : null}

      {payDue === 'due' ? (
        <View style={s.payDue}>
          <Text role="body" style={{ fontWeight: '500' }}>
            {t('order.payNow', { amount: t.money(order.totals.total.amount) })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {ONLINE_PROVIDERS.map((option) => (
              <Button
                key={option.id}
                label={option.title}
                style={{ flex: 1, height: 44 }}
                onPress={() => {
                  void startOnlinePayment(
                    api(),
                    order.id,
                    option.id,
                    `bazar-customer://order/${order.id}`,
                  ).then((url) => url && Linking.openURL(url).catch(() => undefined));
                }}
              />
            ))}
          </View>
        </View>
      ) : payDue === 'waiting' ? (
        <Panel style={[s.paper, { marginTop: 12, padding: 12 }]}>
          <Text role="muted">{t('order.payLater')}</Text>
        </Panel>
      ) : null}

      {terminal ? (
        <Panel style={[s.paper, { marginTop: 12, padding: 12, gap: 8 }]}>
          {subscribed ? (
            <Text role="muted">
              {t('subs.subscribed', { when: slotLabel(subscribed, locale) })}
            </Text>
          ) : !subscribing ? (
            <Pressable onPress={() => setSubscribing(true)}>
              <Text role="body" style={{ color: color.brand500, fontWeight: '500' }}>
                {t('subs.repeatWeekly')}
              </Text>
              <Text role="caption">{t('subs.intro')}</Text>
            </Pressable>
          ) : (
            <>
              <Text role="caption">{t('subs.pickDay')}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {WEEKDAY_ORDER.map((day) => (
                  <Chip
                    key={day}
                    label={t(`weekday.${day}` as MessageKey)}
                    active={subWeekday === day}
                    onPress={() => setSubWeekday(day)}
                  />
                ))}
              </View>
              <Text role="caption">{t('subs.pickTime')}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {SLOT_HOURS.map((hour) => (
                  <Chip
                    key={hour}
                    label={slotTime(hour)}
                    active={subHour === hour}
                    onPress={() => setSubHour(hour)}
                  />
                ))}
              </View>
              <Button
                label={t('subs.subscribe')}
                onPress={() => void subscribe()}
                style={{ height: 44 }}
              />
              <Pressable onPress={() => void subscribe([1, 2, 3, 4, 5, 6])} hitSlop={8}>
                <Text
                  role="muted"
                  style={{
                    marginTop: 8,
                    textAlign: 'center',
                    color: color.brand500,
                    fontWeight: '500',
                  }}
                >
                  {t('order.repeatDaily')}
                </Text>
              </Pressable>
            </>
          )}
        </Panel>
      ) : null}

      {status === ORDER_STATUS.DELIVERED ? <AfterDelivery order={order} /> : null}

      {status === ORDER_STATUS.DELIVERED && lateRefundDue(order) ? (
        <View style={s.arrived}>
          <Text role="muted" style={{ color: color.ink }}>
            {t('order.late', {
              minutes: lateMinutes(order),
              amount: t.money(order.totals.deliveryFee.amount),
            })}
          </Text>
        </View>
      ) : null}
      {status === ORDER_STATUS.DELIVERED && freshnessOpen(order) ? (
        <Panel style={[s.paper, { marginTop: 12, padding: 12, gap: 8 }]}>
          {complaintSent ? (
            <Text role="muted">{t('order.freshnessSent', { number: complaintSent })}</Text>
          ) : (
            <>
              <Text role="muted">
                {t('order.freshness', {
                  time:
                    freshnessDeadline(order)?.toLocaleTimeString(
                      locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU',
                      { hour: '2-digit', minute: '2-digit' },
                    ) ?? '',
                })}
              </Text>
              <Field
                value={complaint}
                onChangeText={setComplaint}
                placeholder={t('order.freshnessPlaceholder')}
                style={{ height: 44 }}
              />
              <Button
                label={t('order.freshnessReport')}
                disabled={!complaint.trim() || complaining}
                onPress={() => void reportFreshness()}
                style={{ height: 44 }}
              />
            </>
          )}
        </Panel>
      ) : null}

      {status === ORDER_STATUS.COURIER_ARRIVED ? (
        <View style={s.arrived}>
          <Text role="muted" style={{ color: color.ink }}>
            {t('order.arrived', {
              entrance: order.address.entrance ? ` ${order.address.entrance}` : '',
            })}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: 12 }}>
        <Row
          icon={<Home size={20} color={color.saffron600} />}
          tone="saffron"
          eyebrow={t('order.where')}
          title={addressLabel(order.address.formatted)}
          {...(order.recipientPhone
            ? {
                subtitle: `${t('order.recipient', { name: order.recipientName || order.recipientPhone })}${order.recipientName ? ` · ${order.recipientPhone}` : ''}`,
              }
            : {})}
        />
        <Row
          icon={<Receipt size={20} color={color.inkMuted} />}
          eyebrow={t('order.number', { number: order.number })}
          title={`${tr(order.store.name, locale)} · ${t.money(order.totals.total.amount)} · ${paymentMethodText(locale)[order.paymentMethod].title}${order.paymentMethod === 'ONLINE' ? ` · ${paymentStatusText(locale)[order.paymentStatus]}` : ''}`}
          chevron={false}
          trailing={
            <View style={{ transform: [{ rotate: details ? '90deg' : '0deg' }] }}>
              <Chevron size={20} color={color.inkFaint} />
            </View>
          }
          onPress={() => setDetails((v) => !v)}
        />
        {order.paymentMethod === 'INVOICE' ? (
          <Pressable
            onPress={() => Linking.openURL(`${WEB_URL}/${locale}/orders/${order.id}/invoice`)}
            hitSlop={6}
          >
            <Text role="caption" style={{ paddingHorizontal: 12, color: color.brand500 }}>
              {order.dueAt ? `${t('order.invoiceDue', { date: t.date(order.dueAt) })} · ` : ''}
              {t('order.invoice')} ↗
            </Text>
          </Pressable>
        ) : null}
      </View>

      {details ? (
        <Panel style={[s.paper, { marginTop: 4, padding: 12 }]}>
          {order.items.map((item) => (
            <View key={item.id} style={s.item}>
              {item.weighingPhotoUrl ? (
                <Pressable onPress={() => Linking.openURL(item.weighingPhotoUrl ?? '')}>
                  <Photo uri={item.weighingPhotoUrl} style={s.thumb} />
                </Pressable>
              ) : null}
              {item.actualQuantity === 0 ? (
                // The stall did not have it: the line stays visible, off the bill.
                <Text role="muted" numberOfLines={2} style={{ flex: 1 }}>
                  <Text role="muted" style={{ textDecorationLine: 'line-through' }}>
                    {tr(item.name, locale)}
                  </Text>{' '}
                  {t('order.missing')}
                </Text>
              ) : (
                <Text role="muted" numberOfLines={1} style={{ flex: 1, color: color.ink }}>
                  {tr(item.name, locale)}{' '}
                  <Text role="muted">
                    × {t.qty(item.actualQuantity ?? item.quantity)} {unitLabel(locale)[item.unit]}
                    {item.actualQuantity !== null && item.actualQuantity !== item.quantity
                      ? t('order.ordered', { quantity: item.quantity })
                      : ''}
                  </Text>
                </Text>
              )}
              <Text role="muted" style={{ color: color.ink }}>
                {t.money((item.actualTotal ?? item.total).amount)}
              </Text>
            </View>
          ))}
          <View
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: color.line,
              gap: 2,
            }}
          >
            <Line label={t('order.goods')} value={t.money(order.totals.subtotal.amount)} />
            <Line label={t('order.delivery')} value={t.money(order.totals.deliveryFee.amount)} />
            {order.totals.serviceFee.amount > 0 ? (
              <Line label={t('order.serviceFee')} value={t.money(order.totals.serviceFee.amount)} />
            ) : null}
            <Line
              label={weighed ? t('order.totalWeighed') : t('order.total')}
              value={t.money(order.totals.total.amount)}
              strong
            />
          </View>
          {order.comment ? (
            <Text role="muted" style={{ marginTop: 8 }}>
              {order.comment}
            </Text>
          ) : null}
        </Panel>
      ) : null}
      {cancellable ? (
        <View style={s.cancelRow}>
          {confirming ? (
            <>
              <Text role="muted">{t('order.cancelQ')}</Text>
              <Pressable onPress={onCancel} hitSlop={8}>
                <Text role="muted" style={{ color: color.danger, fontWeight: '500' }}>
                  {t('order.cancelYes')}
                </Text>
              </Pressable>
              <Pressable onPress={() => setConfirming(false)} hitSlop={8}>
                <Text role="muted">{t('order.keep')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setConfirming(true)} hitSlop={8}>
              <Text role="muted" style={{ textDecorationLine: 'underline' }}>
                {t('order.cancel')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </Shell>
  );
}

/** The "live" dot next to the status while something is still moving; still under «Уменьшить движение». */
function Pulse() {
  const grow = useRef(new Animated.Value(1)).current;
  const still = useReducedMotion();
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(grow, { toValue: 2.2, duration: 900, useNativeDriver: true }),
        Animated.timing(grow, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [grow, still]);
  const opacity = grow.interpolate({ inputRange: [1, 2.2], outputRange: [0.6, 0] });
  return (
    <View style={{ width: 10, height: 10, marginTop: 8 }}>
      <Animated.View style={[s.pulseRing, { transform: [{ scale: grow }], opacity }]} />
      <View style={s.pulseDot} />
    </View>
  );
}

const s = StyleSheet.create({
  // The live status, on the sheet's kraft: serif, the title step; the hint under it is said.
  status: { flex: 1, ...scale.title },
  hint: { marginTop: 4, fontFamily: sceneFont.italic, ...scale.lead, color: color.inkMuted },
  // Paper lying on the sheet's kraft: flat.
  paper: { backgroundColor: color.tile, borderRadius: radius.paper },
  eta: {
    backgroundColor: color.saffron100,
    borderRadius: radius.paper,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'flex-end',
  },
  etaValue: {
    fontFamily: font.display,
    ...scale.lead,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  etaSlot: scale.body,
  steps: { flexDirection: 'row', marginTop: 20 },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  // The stops sit in a 14-tall row, so the thread's 2 px run through their middle at 6.
  thread: {
    position: 'absolute',
    top: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: color.sand300,
  },
  walked: { height: 2, borderRadius: 1, backgroundColor: color.brand500 },
  stopRow: { height: 14, justifyContent: 'center' },
  stop: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: color.sand300,
    backgroundColor: color.raise,
  },
  stopDone: { backgroundColor: color.brand500, borderColor: color.brand500 },
  stopActive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.saffron400,
    borderColor: color.saffron500,
  },
  courier: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.brand500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: color.white, fontFamily: font.display, ...scale.lead },
  action: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.raise,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrived: {
    marginTop: 12,
    backgroundColor: color.saffron100,
    borderRadius: radius.paper,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  thumb: { width: 40, height: 40 },
  payDue: {
    marginTop: 12,
    backgroundColor: color.saffron100,
    borderRadius: radius.paper,
    padding: 12,
  },
  storyRow: { flexDirection: 'row', gap: 12 },
  storyRail: { width: 14, alignItems: 'center' },
  storyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: color.brand500,
  },
  storyDotLive: {
    backgroundColor: color.saffron400,
    borderWidth: 3,
    borderColor: color.saffron100,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 4,
  },
  storyLine: { flex: 1, width: 2, marginTop: 4, backgroundColor: color.line },
  storyPhoto: {
    width: 108,
    height: 108,
    borderRadius: radius.photo,
    overflow: 'hidden',
    backgroundColor: color.field,
    justifyContent: 'flex-end',
  },
  // A glass pill over the weighing photo.
  storyPhotoTag: {
    margin: 6,
    alignSelf: 'flex-start',
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassEdge,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  storyPhotoText: { color: scene.cream, ...scale.caption, fontWeight: '700' },
  cancelRow: {
    marginTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.saffron500,
  },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.brand500 },
});
