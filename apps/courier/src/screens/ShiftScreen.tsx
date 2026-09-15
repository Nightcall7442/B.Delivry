/**
 * The whole courier day on one screen: the map with the trip, the shift
 * switch, offer cards that count down, and the one big button for the
 * active delivery. A courier works this app with one thumb on a scooter,
 * so nothing here needs precision.
 */
import {
  Button,
  MapView,
  Panel,
  Text,
  api,
  color,
  font,
  radius,
  shadow,
  useAuth,
  type MapMarker,
  OrderChat,
} from '@bazar/mobile';
import { SUBSTITUTION_TEXT, plural } from '@bazar/storefront';
import { formatMoney } from '@bazar/utils/money';
import type { DeliveryDto, DeliveryOfferDto, OrderDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WeighingSheet } from '@/components/WeighingSheet';
import { useShift } from '@/features/shift';

const DEFAULT_CENTER = { lat: 41.3111, lng: 69.2797 };

const STEP: Record<DeliveryDto['status'], { title: string; hint: string; button: string | null }> =
  {
    PENDING: { title: 'Заказ ждёт', hint: '', button: null },
    SEARCHING: { title: 'Заказ ждёт', hint: '', button: null },
    ASSIGNED: {
      title: 'Едем к продавцу',
      hint: 'Заберите заказ у прилавка',
      button: 'Я у продавца',
    },
    AT_PICKUP: {
      title: 'У продавца',
      hint: 'Проверьте заказ и заберите пакеты',
      button: 'Забрал заказ',
    },
    PICKED_UP: {
      title: 'Везём клиенту',
      hint: 'Клиент видит вас на карте',
      button: 'Я у подъезда',
    },
    IN_TRANSIT: {
      title: 'Везём клиенту',
      hint: 'Клиент видит вас на карте',
      button: 'Я у подъезда',
    },
    AT_DROPOFF: { title: 'У клиента', hint: 'Спросите код из приложения', button: 'Доставил' },
    DELIVERED: { title: 'Доставлено', hint: '', button: null },
    FAILED: { title: 'Не доставлено', hint: '', button: null },
    CANCELLED: { title: 'Отменён', hint: '', button: null },
  };

export function ShiftScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const {
    courier,
    online,
    offers,
    active,
    siblings,
    position,
    busy,
    error,
    setOnline,
    accept,
    decline,
    advance,
  } = useShift();

  const markers: MapMarker[] = [
    ...(position ? [{ id: 'me', point: position, kind: 'courier' as const }] : []),
    ...(active?.pickupPoint
      ? [{ id: 'pickup', point: active.pickupPoint, kind: 'store' as const, label: 'Продавец' }]
      : []),
    ...(active?.dropoffPoint
      ? [{ id: 'dropoff', point: active.dropoffPoint, kind: 'home' as const }]
      : []),
  ];
  const center = position ?? active?.pickupPoint ?? courier?.lastLocation ?? DEFAULT_CENTER;

  return (
    <View style={s.root}>
      <MapView center={center} zoom={13} markers={markers} inset={0.45} />

      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <View style={[s.shiftCard, shadow.card]}>
          <View style={{ flex: 1 }}>
            <Text role="title">
              {courier ? `${courier.firstName}` : (user?.firstName ?? 'Курьер')}
            </Text>
            <Text role="caption">
              {courier
                ? `★ ${courier.rating.toFixed(1)} · ${courier.completedOrders} ${plural(courier.completedOrders, 'доставка', 'доставки', 'доставок')} · ${online ? 'на смене' : 'не на смене'}`
                : 'Аккаунт не курьерский'}
            </Text>
          </View>
          <Switch
            value={online}
            disabled={busy || !courier}
            onValueChange={(next) => void setOnline(next)}
            trackColor={{ false: color.lineStrong, true: color.brand400 }}
            thumbColor={color.white}
          />
        </View>
      </View>

      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.grip} />
        <ScrollView contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
          {error ? <Text style={s.error}>{error}</Text> : null}

          {active ? (
            <ActiveCard delivery={active} siblings={siblings} busy={busy} onAdvance={advance} />
          ) : offers.length > 0 ? (
            offers.map((offer) => (
              <OfferCard
                key={offer.deliveryId}
                offer={offer}
                busy={busy}
                onAccept={accept}
                onDecline={decline}
              />
            ))
          ) : (
            <Panel style={s.idle}>
              <Text role="section">{online ? 'Ждём заказы' : 'Смена не начата'}</Text>
              <Text role="muted">
                {online
                  ? 'Заказы рядом с вами появятся здесь. Держите приложение открытым.'
                  : 'Включите переключатель наверху, чтобы получать заказы.'}
              </Text>
            </Panel>
          )}

          <Pressable
            onPress={() => {
              void signOut().then(() => router.replace('/login'));
            }}
            style={s.signOut}
          >
            <Text role="caption">{user?.phone} · Выйти</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

function OfferCard({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: DeliveryOfferDto;
  busy: boolean;
  onAccept: (offer: DeliveryOfferDto) => void;
  onDecline: (offer: DeliveryOfferDto) => void;
}) {
  const [left, setLeft] = useState(() => secondsLeft(offer.expiresAt));
  useEffect(() => {
    const timer = setInterval(() => setLeft(secondsLeft(offer.expiresAt)), 500);
    return () => clearInterval(timer);
  }, [offer.expiresAt]);

  return (
    <Panel style={[s.offer, shadow.pop]}>
      <View style={s.offerHead}>
        <Text role="display">{formatMoney(offer.payout.amount)}</Text>
        <View style={s.timer}>
          <Text style={s.timerText}>{left} с</Text>
        </View>
      </View>
      <Text role="title">{offer.storeName}</Text>
      <Text role="muted" numberOfLines={1}>
        {offer.pickupAddress}
      </Text>
      <Text role="muted" numberOfLines={1}>
        → {offer.dropoffAddress}
      </Text>
      <Text role="caption">
        {(offer.distanceMeters / 1000).toFixed(1)} км · {offer.itemCount} поз. ·{' '}
        {Math.max(1, Math.round(offer.weightGrams / 1000))} кг
      </Text>
      <View style={s.offerActions}>
        <Button
          label="Пропустить"
          variant="secondary"
          style={{ flex: 1 }}
          disabled={busy}
          onPress={() => onDecline(offer)}
        />
        <Button
          label="Принять"
          style={{ flex: 2 }}
          disabled={busy}
          onPress={() => onAccept(offer)}
        />
      </View>
    </Panel>
  );
}

function ActiveCard({
  delivery,
  siblings,
  busy,
  onAdvance,
}: {
  delivery: DeliveryDto;
  siblings: DeliveryDto[];
  busy: boolean;
  onAdvance: (handoverCode?: string) => void;
}) {
  const step = STEP[delivery.status];
  const atDoor = delivery.status === 'AT_DROPOFF';
  const needsCode = atDoor && delivery.proofType === 'CODE';
  const [code, setCode] = useState('');
  const [weighing, setWeighing] = useState(false);
  const [chat, setChat] = useState(false);
  const toPickup = delivery.status === 'ASSIGNED' || delivery.status === 'AT_PICKUP';

  // At the stall the button first opens the scale sheet; "picked up" follows the save.
  if (weighing) {
    return (
      <Panel style={s.active}>
        <WeighingSheet
          orderId={delivery.orderId}
          busy={busy}
          onDone={() => {
            setWeighing(false);
            onAdvance();
          }}
        />
        <Pressable onPress={() => setWeighing(false)} style={{ alignSelf: 'center', padding: 8 }}>
          <Text role="caption">Назад</Text>
        </Pressable>
      </Panel>
    );
  }

  return (
    <Panel style={s.active}>
      <Text role="caption">Заказ · {formatMoney(delivery.payout.amount)} за доставку</Text>
      <Text role="display">{step.title}</Text>
      <Text role="muted">{step.hint}</Text>

      <View style={s.addressBlock}>
        <Text role="caption">{toPickup ? 'Куда ехать' : 'Адрес клиента'}</Text>
        <Text role="body">{toPickup ? delivery.pickupAddress : delivery.dropoffAddress}</Text>
        {siblings.length > 0 && toPickup ? (
          <Text role="muted" style={{ color: color.ink, marginTop: 4 }}>
            Одной поездкой · ещё {siblings.length}:{' '}
            {siblings.map((row) => row.pickupAddress).join('; ')}
          </Text>
        ) : null}
      </View>
      {toPickup ? <PickupNotes orderId={delivery.orderId} /> : null}
      {toPickup ? siblings.map((row) => <PickupNotes key={row.id} orderId={row.orderId} />) : null}

      <Pressable onPress={() => setChat((v) => !v)} style={{ marginTop: 8 }} hitSlop={6}>
        <Text role="caption" style={{ color: color.brand600, fontWeight: '500' }}>
          {chat ? 'Скрыть чат' : 'Чат с клиентом'}
        </Text>
      </Pressable>
      {chat ? (
        <View style={{ marginTop: 8 }}>
          <OrderChat orderId={delivery.orderId} me="COURIER" onClose={() => setChat(false)} />
        </View>
      ) : null}

      {needsCode ? (
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="Код от клиента"
          placeholderTextColor={color.inkFaint}
          keyboardType="number-pad"
          style={s.codeInput}
        />
      ) : null}

      {step.button ? (
        <Button
          label={busy ? 'Секунду…' : step.button}
          disabled={busy || (needsCode && code.length < 4)}
          onPress={() =>
            delivery.status === 'AT_PICKUP'
              ? setWeighing(true)
              : onAdvance(needsCode ? code : undefined)
          }
          style={{ marginTop: 12 }}
        />
      ) : null}
    </Panel>
  );
}

/** What the customer told the stall, and what to do if something is out. */
function PickupNotes({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderDto | null>(null);
  useEffect(() => {
    api()
      .orders.get(orderId)
      .then(setOrder)
      .catch(() => undefined);
  }, [orderId]);
  if (!order) return null;
  return (
    <View style={[s.addressBlock, { backgroundColor: color.saffron100 }]}>
      <Text role="caption">Клиент просит</Text>
      {order.vendorComment ? <Text role="body">{order.vendorComment}</Text> : null}
      <Text role="muted" style={{ color: color.ink }}>
        {SUBSTITUTION_TEXT[order.substitutionPolicy].courier}
      </Text>
      {order.recipientPhone ? (
        <Text role="caption" onPress={() => Linking.openURL(`tel:${order.recipientPhone}`)}>
          Получатель{order.recipientName ? ` ${order.recipientName}` : ''} · позвонить ·{' '}
          {order.recipientPhone}
        </Text>
      ) : null}
      {order.customer?.phone ? (
        <Text role="caption" onPress={() => Linking.openURL(`tel:${order.customer?.phone}`)}>
          Позвонить {order.recipientPhone ? 'заказчику' : 'клиенту'} · {order.customer.phone}
        </Text>
      ) : null}
    </View>
  );
}

const secondsLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.sand100 },
  top: { position: 'absolute', left: 12, right: 12, top: 0 },
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.white,
    borderRadius: radius.panel,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    backgroundColor: color.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...shadow.pop,
  },
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.lineStrong,
    marginTop: 8,
  },
  sheetContent: { padding: 16, gap: 12 },
  idle: { gap: 4 },
  error: { color: color.danger, fontSize: 14 },
  offer: { gap: 4, borderWidth: 2, borderColor: color.brand300 },
  offerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: {
    backgroundColor: color.saffron100,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timerText: {
    fontFamily: font.displayBold,
    color: color.saffron600,
    fontVariant: ['tabular-nums'],
  },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  active: { gap: 4 },
  addressBlock: {
    marginTop: 8,
    backgroundColor: color.sand50,
    borderRadius: radius.control,
    padding: 12,
    gap: 2,
  },
  codeInput: {
    marginTop: 8,
    height: 56,
    borderRadius: radius.control,
    backgroundColor: color.sand50,
    paddingHorizontal: 16,
    fontSize: 22,
    letterSpacing: 6,
    color: color.ink,
    fontFamily: font.displayBold,
  },
  signOut: { alignSelf: 'center', paddingVertical: 8 },
});
