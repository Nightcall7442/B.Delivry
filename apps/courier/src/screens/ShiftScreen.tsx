/**
 * The whole courier day on one screen: the map with the trip, the shift
 * switch, offer cards that count down, and the one big button for the
 * active delivery. A courier works this app with one thumb on a scooter,
 * so nothing here needs precision.
 */
import {
  Button,
  MapView,
  Text,
  api,
  color,
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
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CREAM,
  INK,
  INK_MUTED,
  KRAFT,
  PAPER,
  PAPER_EDGE,
  POMEGRANATE,
  SAFFRON,
  Paper,
  sceneFont,
} from '@/components/scene';
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
            <RNText style={s.name}>
              {courier ? `${courier.firstName}` : (user?.firstName ?? 'Курьер')}
            </RNText>
            <RNText style={s.meta}>
              {courier
                ? `★ ${courier.rating.toFixed(1)} · ${courier.completedOrders} ${plural(courier.completedOrders, 'доставка', 'доставки', 'доставок')} · ${online ? 'на смене' : 'не на смене'}`
                : 'Аккаунт не курьерский'}
            </RNText>
          </View>
          <Switch
            value={online}
            disabled={busy || !courier}
            onValueChange={(next) => void setOnline(next)}
            trackColor={{ false: PAPER_EDGE, true: POMEGRANATE }}
            thumbColor={CREAM}
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
            <Paper style={s.idle}>
              <RNText style={s.slipTitle}>{online ? 'Ждём заказы' : 'Смена не начата'}</RNText>
              <RNText style={s.hand}>
                {online
                  ? 'Заказы рядом с вами появятся здесь. Держите приложение открытым.'
                  : 'Включите переключатель наверху, чтобы получать заказы.'}
              </RNText>
            </Paper>
          )}

          <Pressable
            onPress={() => {
              void signOut().then(() => router.replace('/login'));
            }}
            style={s.signOut}
          >
            <RNText style={s.signOutText}>{user?.phone} · Выйти</RNText>
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
    <Paper style={s.offer}>
      <View style={s.offerHead}>
        <RNText style={s.money}>{formatMoney(offer.payout.amount)}</RNText>
        <View style={s.timer}>
          <RNText style={s.timerText}>{left} с</RNText>
        </View>
      </View>
      <RNText style={s.slipTitle}>{offer.storeName}</RNText>
      <RNText style={s.muted} numberOfLines={1}>
        {offer.pickupAddress}
      </RNText>
      <RNText style={s.muted} numberOfLines={1}>
        → {offer.dropoffAddress}
      </RNText>
      <RNText style={s.hand}>
        {(offer.distanceMeters / 1000).toFixed(1)} км · {offer.itemCount} поз. ·{' '}
        {Math.max(1, Math.round(offer.weightGrams / 1000))} кг
      </RNText>
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
    </Paper>
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
      <Paper style={s.active}>
        <WeighingSheet
          orderId={delivery.orderId}
          busy={busy}
          onDone={() => {
            setWeighing(false);
            onAdvance();
          }}
        />
        <Pressable onPress={() => setWeighing(false)} style={{ alignSelf: 'center', padding: 8 }}>
          <RNText style={s.link}>Назад</RNText>
        </Pressable>
      </Paper>
    );
  }

  return (
    <Paper style={s.active}>
      <RNText style={s.hand}>Заказ · {formatMoney(delivery.payout.amount)} за доставку</RNText>
      <RNText style={s.stepTitle}>{step.title}</RNText>
      <RNText style={s.muted}>{step.hint}</RNText>

      <View style={s.addressBlock}>
        <RNText style={s.label}>{toPickup ? 'Куда ехать' : 'Адрес клиента'}</RNText>
        <RNText style={s.address}>
          {toPickup ? delivery.pickupAddress : delivery.dropoffAddress}
        </RNText>
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
        <RNText style={s.link}>{chat ? 'Скрыть чат' : 'Чат с клиентом'}</RNText>
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
    </Paper>
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
    <View style={[s.addressBlock, { backgroundColor: '#FBEBC9' }]}>
      <RNText style={s.label}>Клиент просит</RNText>
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
  root: { flex: 1, backgroundColor: '#1E1408' },
  top: { position: 'absolute', left: 12, right: 12, top: 0 },
  // Kraft pinned over the map: the courier's name in serif, the day's numbers by hand.
  shiftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: KRAFT,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    transform: [{ rotate: '-0.4deg' }],
  },
  name: { fontFamily: sceneFont.display, fontSize: 24, lineHeight: 28, color: INK },
  meta: { fontFamily: sceneFont.hand, fontSize: 17, color: INK_MUTED, marginTop: 1 },
  // The sheet is a sheet of paper with a perforated edge.
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '58%',
    backgroundColor: PAPER,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: PAPER_EDGE,
    ...shadow.pop,
  },
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: PAPER_EDGE,
    marginTop: 8,
  },
  sheetContent: { padding: 16, gap: 12 },
  idle: { gap: 4, backgroundColor: '#FBF5E6' },
  error: { color: POMEGRANATE, fontFamily: sceneFont.hand, fontSize: 17 },
  slipTitle: { fontFamily: sceneFont.display, fontSize: 22, lineHeight: 26, color: INK },
  stepTitle: {
    fontFamily: sceneFont.display,
    fontSize: 32,
    lineHeight: 36,
    color: INK,
    marginTop: 2,
  },
  hand: { fontFamily: sceneFont.hand, fontSize: 18, lineHeight: 22, color: INK_MUTED },
  muted: { fontFamily: sceneFont.ui, fontSize: 14, lineHeight: 20, color: INK_MUTED },
  label: {
    fontFamily: sceneFont.uiHeavy,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: INK_MUTED,
  },
  address: { fontFamily: sceneFont.ui, fontSize: 16, lineHeight: 22, color: INK, marginTop: 2 },
  link: {
    fontFamily: sceneFont.hand,
    fontSize: 19,
    color: POMEGRANATE,
    textDecorationLine: 'underline',
  },
  offer: { gap: 4, backgroundColor: '#FBF5E6', borderColor: SAFFRON, borderWidth: 1.5 },
  offerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  money: { fontFamily: sceneFont.hand, fontSize: 40, lineHeight: 44, color: POMEGRANATE },
  // The countdown as a rubber stamp.
  timer: {
    borderWidth: 2,
    borderColor: POMEGRANATE,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    transform: [{ rotate: '-4deg' }],
  },
  timerText: {
    fontFamily: sceneFont.hand,
    fontSize: 20,
    color: POMEGRANATE,
    fontVariant: ['tabular-nums'],
  },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  active: { gap: 4, backgroundColor: '#FBF5E6' },
  addressBlock: {
    marginTop: 8,
    backgroundColor: KRAFT,
    borderRadius: 6,
    padding: 12,
    gap: 2,
  },
  codeInput: {
    marginTop: 8,
    height: 56,
    borderRadius: 6,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: PAPER_EDGE,
    backgroundColor: 'rgba(234,216,178,0.45)',
    paddingHorizontal: 16,
    fontSize: 26,
    letterSpacing: 6,
    color: INK,
    fontFamily: sceneFont.hand,
  },
  signOut: { alignSelf: 'center', paddingVertical: 8 },
  signOutText: { fontFamily: sceneFont.hand, fontSize: 17, color: INK_MUTED },
});
