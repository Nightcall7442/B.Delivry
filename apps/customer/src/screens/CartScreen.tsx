/**
 * The basket as a receipt from the bazaar: one paper slip per stall, printed
 * out as it appears, the names in serif and the sums in tabular figures, the
 * stamp «взвесим при сборке» when anything is sold by weight, delivery and
 * cashback under the rule, and one pomegranate «Оформить». A bazaar order is
 * picked up at one place, so two stalls are two slips; stalls on one bazaar
 * can share a courier.
 */
import {
  CART_NOTE_MAX,
  type CartLine,
  cashbackFor,
  decodeShare,
  encodeShare,
  basketGrams,
  estimateDelivery,
  haggleFor,
  isShopfront,
  type MapStoreDto,
  oneTrip as oneTripStores,
  tr,
  unitLabel,
} from '@bazar/storefront';
import { CASHBACK } from '@bazar/constants';
import type { ProductDto } from '@bazar/types';
import { isApiError, room } from '@bazar/api-client';
import { WS_EVENT, type HaggleDto } from '@bazar/types';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Display,
  Glass,
  Printed,
  Say,
  Scene,
  SceneButton,
  caps,
  ground,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { useAddress } from '@/features/address/store';
import {
  groupByStore,
  useCartActions,
  useCartNotes,
  useCartQuantities,
  useCartReady,
} from '@/features/cart/store';
import { listProductsByIds, listStores } from '@/lib/catalog';
import { useData, useList } from '@/lib/use-data';
import {
  ArrowLeft,
  Clock,
  Minus,
  Photo,
  Pin,
  Plus,
  Share as ShareIcon,
  api,
  noOutline,
  radius,
  scale,
  shadow,
  useAuth,
  useLocale,
} from '@bazar/mobile';

const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'http://localhost:3000';

/** A store the list has not delivered yet reads as a stall. */
const NOBODY = { type: 'BAZAAR_STALL', ownerName: null } as const;

export function CartScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  // Торг: the customer's open asks and agreed prices, refreshed when the stall answers.
  const [haggles, setHaggles] = useState<HaggleDto[]>([]);
  const [haggleError, setHaggleError] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.customerId) return;
    const load = () =>
      api()
        .haggle.mine()
        .then(setHaggles)
        .catch(() => undefined);
    load();
    const realtime = api().realtime;
    void realtime.connect();
    realtime.join(room.customer(user.customerId));
    return realtime.on(WS_EVENT.HAGGLE_ANSWERED, load);
  }, [user?.customerId]);
  const ask = async (productId: string, askedPrice: number) => {
    setHaggleError(null);
    try {
      const created = await api().haggle.ask({ productId, askedPrice });
      setHaggles((current) => [created, ...current]);
    } catch (cause) {
      setHaggleError(isApiError(cause) ? cause.message : t('common.error'));
    }
  };
  const quantities = useCartQuantities();
  const { setQuantity, clear } = useCartActions();
  const { address } = useAddress();
  // Only what the basket holds, by id — a shop shelf is bigger than one page. Products
  // already priced stay put while new ids load, so the sheet never blinks empty.
  const known = useRef(new Map<string, ProductDto>());
  const missing = Object.keys(quantities)
    .filter((id) => !known.current.has(id))
    .sort()
    .join(',');
  const fetched = useData(() => listProductsByIds(missing ? missing.split(',') : []), [missing]);
  for (const p of fetched ?? []) known.current.set(p.id, p);
  const products = useMemo(
    () =>
      Object.keys(quantities)
        .map((id) => known.current.get(id))
        .filter((p): p is ProductDto => p !== undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quantities, fetched],
  );
  // Семейная корзина: a `?share=` link merges the sender's cart into this one, once.
  const { share } = useLocalSearchParams<{ share?: string }>();
  const navReady = useRootNavigationState()?.key !== undefined;
  const cartReady = useCartReady();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!share || !navReady || !cartReady) return;
    for (const [id, quantity] of Object.entries(decodeShare(share))) {
      setQuantity(id, (quantities[id] ?? 0) + quantity);
    }
    setNotice(t('cart.shared'));
    router.setParams({ share: '' });
    // Runs once per link; later quantity changes must not re-merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, navReady, cartReady]);
  const shareCart = () => {
    const url = `${WEB_URL}/${locale}/cart?share=${encodeURIComponent(encodeShare(quantities))}`;
    void Share.share({ message: url }).catch(() => undefined);
  };
  const stores = useList(() => listStores(), []);

  const groups = useMemo(() => groupByStore(products, quantities), [products, quantities]);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  // Cross-bazaar: stalls of one bazaar → one courier trip on offer; shops always ride alone.
  const oneTrip = useMemo(() => oneTripStores(groups, storeById), [groups, storeById]);
  const estimates = groups.map((group) => {
    const store = storeById.get(group.storeId);
    return store && address
      ? estimateDelivery(store.point, address.point, store.preparationMinutes, {
          subtotal: group.subtotal.amount,
          freeDeliveryThreshold: store.freeDeliveryThreshold,
          weightGrams: basketGrams(group.lines),
        })
      : null;
  });
  const grandTotal = groups.reduce(
    (sum, group, i) => sum + group.subtotal.amount + (estimates[i]?.fee.amount ?? 0),
    0,
  );
  const toCheckout = (ids: string[]) =>
    router.push({
      pathname: '/checkout',
      params: { store: ids[0] ?? '', stores: ids.slice(1).join(',') },
    });
  // One stall, or every stall on one bazaar: a single «Оформить»; otherwise each slip has its own.
  const single =
    groups.length === 1
      ? [groups[0]!.storeId]
      : oneTrip && oneTrip.length === groups.length
        ? oneTrip
        : null;
  const backdrop = storeById.get(groups[0]?.storeId ?? '')?.coverUrl ?? null;
  const firstEta = estimates.find((e) => e)?.etaMinutes ?? null;
  const subtitle =
    groups.length === 0
      ? ''
      : single
        ? groups.length === 1
          ? t(isShopfront(storeById.get(single[0]!) ?? NOBODY) ? 'receipt.shop' : 'receipt.stall')
          : t.n('receipt.together', groups.length)
        : t.n('receipt.separate', groups.length);

  return (
    <View style={{ flex: 1 }}>
      <Scene source={backdrop} style={StyleSheet.absoluteFill}>
        {/* The counter's photograph sinks into the ground so the receipts read on top of it. */}
        {backdrop ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: ground(0.55) }]} />
        ) : null}
      </Scene>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: top + 64,
          paddingBottom: (single ? 170 : 110) + insets.bottom,
          gap: 18,
        }}
      >
        {groups.length === 0 ? (
          <View style={{ paddingHorizontal: 24, paddingTop: 60, gap: 12 }}>
            <Display step="headline">{t('cart.empty')}</Display>
            <Say color={scene.creamMuted}>{t('receipt.emptyLine')}</Say>
            <Pressable onPress={() => router.replace('/')} style={s.emptyCta}>
              <Text style={s.emptyCtaText}>{t('scene.walkRow')} →</Text>
            </Pressable>
          </View>
        ) : null}

        {notice ? (
          <Say step="lead" color={scene.ochreLight} style={{ paddingHorizontal: 24 }}>
            {notice}
          </Say>
        ) : null}
        {groups.length > 1 && !single ? (
          <Text style={s.hint}>
            {oneTrip ? t('cart.oneTripHint', { count: oneTrip.length }) : t('cart.multi')}
          </Text>
        ) : null}
        {oneTrip && !single ? (
          <Pressable
            onPress={() => toCheckout(oneTrip)}
            style={[s.cta, s.ctaLift, { marginHorizontal: 20 }]}
          >
            <Text style={s.ctaLabel}>{t('cart.oneTrip')}</Text>
          </Pressable>
        ) : null}

        {groups.map((group, i) => {
          const store = storeById.get(group.storeId);
          const estimate = estimates[i];
          const ids = [...group.lines, ...group.unavailable].map((l) => l.product.id);
          const total = group.subtotal.amount + (estimate?.fee.amount ?? 0);
          const weighed = group.lines.some((l) => l.product.unit === 'KG');
          return (
            <Printed key={group.storeId}>
              <Receipt
                store={store ?? null}
                lines={group.lines}
                unavailable={group.unavailable.map((l) => tr(l.product.name, locale))}
                subtotal={group.subtotal.amount}
                fee={estimate?.fee.amount ?? null}
                total={total}
                weighed={weighed}
                tilt={i % 2 === 0 ? -0.6 : 0.5}
                haggles={haggles}
                haggleError={haggleError}
                onAsk={ask}
                onChange={setQuantity}
                onClear={() => clear(ids)}
                onClearUnavailable={() => clear(group.unavailable.map((l) => l.product.id))}
                onCheckout={single ? null : () => toCheckout([group.storeId])}
              />
            </Printed>
          );
        })}
      </ScrollView>

      <View style={[s.top, { top }]}>
        <SceneButton
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        >
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
        <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>
          <Display step="title">{t('cart.title')}</Display>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {groups.length > 0 ? (
          <SceneButton onPress={shareCart}>
            <ShareIcon size={20} color={scene.ink} />
          </SceneButton>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {single ? (
        <View style={[s.bottom, { bottom: 24 + insets.bottom }]}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Glass style={s.chip} onPress={() => router.push('/checkout')}>
              <Clock size={16} color={scene.ochreLight} />
              <Text style={s.chipText} numberOfLines={1}>
                {firstEta
                  ? t('receipt.when', { time: etaClock(firstEta) })
                  : t('receipt.whenAfter')}
              </Text>
            </Glass>
            <Glass style={s.chip} onPress={() => router.push('/address')}>
              <Pin size={16} color={scene.ochreLight} />
              <Text style={s.chipText} numberOfLines={1}>
                {address ? address.text : t('receipt.addressNone')}
              </Text>
            </Glass>
          </View>
          <Pressable
            onPress={() => toCheckout(single)}
            style={({ pressed }) => [s.cta, s.ctaLift, pressed && { opacity: 0.92 }]}
          >
            <Text style={s.ctaLabel}>{t('cart.checkout')}</Text>
            <Text style={s.ctaSum}>≈ {t.money(grandTotal)}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Tashkent clock for «now + minutes». */
function etaClock(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
}

function Receipt({
  store,
  lines,
  unavailable,
  subtotal,
  fee,
  total,
  weighed,
  tilt,
  haggles,
  haggleError,
  onAsk,
  onChange,
  onClear,
  onClearUnavailable,
  onCheckout,
}: {
  store: MapStoreDto | null;
  lines: CartLine[];
  unavailable: string[];
  subtotal: number;
  fee: number | null;
  total: number;
  weighed: boolean;
  tilt: number;
  haggles: HaggleDto[];
  haggleError: string | null;
  onAsk: (productId: string, price: number) => Promise<void>;
  onChange: (productId: string, quantity: number) => void;
  onClear: () => void;
  onClearUnavailable: () => void;
  onCheckout: (() => void) | null;
}) {
  const { locale, t } = useLocale();
  const date = new Date().toLocaleString('ru-RU', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });
  const person = store?.ownerPhotoUrl ?? store?.coverUrl ?? null;
  return (
    <View style={[s.paper, { transform: [{ rotate: `${tilt}deg` }] }]}>
      <View style={s.perforation} />
      <View style={{ gap: 2 }}>
        <Text style={s.paperTitle}>{t('receipt.title')}</Text>
        <Text style={s.paperDate}>{date.toUpperCase()}</Text>
      </View>
      {weighed ? <Text style={s.stamp}>{t('receipt.weighed')}</Text> : null}

      <View style={s.vendor}>
        {person ? <Photo uri={person} style={s.vendorPhoto} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.vendorName} numberOfLines={1}>
            {store?.ownerName ?? (store ? tr(store.name, locale) : '')}
          </Text>
          <Text style={s.vendorMeta} numberOfLines={1}>
            {store?.ownerName ? tr(store.name, locale) : ''}
            {store?.standNumber ? ` · ${store.standNumber}` : ''}
          </Text>
        </View>
        <Pressable onPress={onClear} hitSlop={14}>
          <Text style={s.clear}>{t('cart.clear')}</Text>
        </Pressable>
      </View>

      {lines.map((line) => (
        <ReceiptRow
          key={line.product.id}
          line={line}
          haggle={haggleFor(haggles, line.product.id)}
          onAsk={onAsk}
          onChange={(q) => onChange(line.product.id, q)}
        />
      ))}
      {haggleError ? (
        <Text style={[s.small, { color: scene.pomegranate }]}>{haggleError}</Text>
      ) : null}
      {unavailable.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 6 }}>
          <Text style={s.small}>
            {t('cart.unavailable')} {unavailable.join(', ')}.
          </Text>
          <Pressable onPress={onClearUnavailable} hitSlop={14}>
            <Text style={[s.small, { textDecorationLine: 'underline' }]}>{t('common.remove')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={s.totals}>
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{t('cart.goods')}</Text>
          <Text style={s.totalValue}>
            {weighed ? '≈ ' : ''}
            {t.money(subtotal)}
          </Text>
        </View>
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>{t('cart.delivery')}</Text>
          <Text style={s.totalValue}>{fee !== null ? t.money(fee) : t('cart.afterAddress')}</Text>
        </View>
        <View style={s.totalRow}>
          <Text style={[s.totalLabel, { color: scene.pomegranate }]}>
            {t('receipt.cashback', { percent: CASHBACK.PERCENT })}
          </Text>
          <Text style={[s.totalValue, { color: scene.pomegranate }]}>
            + {t.money(cashbackFor(subtotal))}
          </Text>
        </View>
        <View style={[s.totalRow, { alignItems: 'baseline', marginTop: 4 }]}>
          <Text style={s.grand}>{t('cart.total')}</Text>
          <Text style={s.grandValue}>
            {weighed ? '≈ ' : ''}
            {t.money(total)}
          </Text>
        </View>
        {weighed ? <Text style={s.small}>{t('receipt.exact')}</Text> : null}
      </View>

      {onCheckout ? (
        <Pressable
          onPress={onCheckout}
          style={({ pressed }) => [s.cta, s.ctaOnPaper, pressed && { opacity: 0.92 }]}
        >
          <Text style={s.ctaLabel}>{t('cart.checkout')}</Text>
          <Text style={s.ctaSum}>{t.money(total)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReceiptRow({
  line,
  haggle,
  onChange,
  onAsk,
}: {
  line: CartLine;
  haggle: HaggleDto | null;
  onChange: (quantity: number) => void;
  onAsk: (productId: string, price: number) => Promise<void>;
}) {
  const { locale, t } = useLocale();
  const [asking, setAsking] = useState(false);
  const [price, setPrice] = useState('');
  const { notes, setNote } = useCartNotes();
  const note = notes[line.product.id] ?? '';
  // «Без кости»: typed here, carried to the stall with the order line.
  const [wishing, setWishing] = useState(false);
  const [wish, setWish] = useState('');
  const keepWish = () => {
    setNote(line.product.id, wish);
    setWishing(false);
  };
  const { product, quantity } = line;
  const step = product.quantityStep || 1;
  const min = product.minQuantity || step;
  const unit = unitLabel(locale)[product.unit];
  const photo = product.images[0]?.url ?? null;

  return (
    <View style={s.row}>
      <View style={s.rowMain}>
        <Photo uri={photo} style={s.thumb} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={s.rowName} numberOfLines={2}>
            {tr(product.name, locale)}
          </Text>
          <Text style={s.small}>
            {t.money(product.price.amount)} / {unit}
            {product.stock !== null && quantity > product.stock
              ? ` · ${t('store.left', { count: product.stock })}`
              : ''}
          </Text>
        </View>
        <Text style={s.rowPrice}>
          {product.unit === 'KG' ? '≈ ' : ''}
          {t.money(line.total.amount)}
        </Text>
      </View>
      <View style={s.rowBottom}>
        <View style={s.stepper}>
          <Pressable
            onPress={() => onChange(quantity - step < min ? 0 : quantity - step)}
            style={s.step}
            hitSlop={8}
          >
            <Minus size={14} color={scene.ink} strokeWidth={2.6} />
          </Pressable>
          <Text style={s.stepValue}>
            {t.qty(quantity)} {unit}
          </Text>
          <Pressable onPress={() => onChange(quantity + step)} style={s.step} hitSlop={8}>
            <Plus size={14} color={scene.ink} strokeWidth={2.6} />
          </Pressable>
        </View>
        {haggle?.status === 'ACCEPTED' && haggle.offeredPrice ? (
          <Text style={[s.small, { color: scene.pomegranate, flex: 1 }]} numberOfLines={2}>
            ✓{' '}
            {t('haggle.accepted', {
              price: t.money(haggle.offeredPrice.amount),
              unit,
              time: new Date(haggle.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </Text>
        ) : haggle?.status === 'PENDING' ? (
          <Text style={[s.small, { flex: 1 }]} numberOfLines={2}>
            {t('haggle.pending', { price: t.money(haggle.askedPrice.amount), unit })}
          </Text>
        ) : haggle?.status === 'DECLINED' ? (
          <Text style={[s.small, { flex: 1 }]}>{t('haggle.declined')}</Text>
        ) : asking ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TextInput
              value={price}
              onChangeText={(v) => setPrice(v.replace(/\D/g, ''))}
              placeholder={t('haggle.placeholder', { unit })}
              placeholderTextColor={scene.inkSoft}
              keyboardType="number-pad"
              style={s.askInput}
            />
            <Pressable
              onPress={() => {
                const minor = Number(price) * 100;
                if (minor > 0) void onAsk(product.id, minor).then(() => setAsking(false));
              }}
              hitSlop={14}
            >
              <Text style={[s.small, s.link]}>{t('haggle.send')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setAsking(true)} hitSlop={14}>
            <Text style={[s.small, s.link]}>{t('haggle.ask')}</Text>
          </Pressable>
        )}
      </View>
      {wishing ? (
        <TextInput
          value={wish}
          onChangeText={setWish}
          placeholder={t('cart.wishPlaceholder')}
          placeholderTextColor={scene.inkSoft}
          maxLength={CART_NOTE_MAX}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={keepWish}
          onBlur={keepWish}
          accessibilityLabel={t('cart.wish')}
          style={[s.askInput, { flex: 0 }]}
        />
      ) : (
        <Pressable
          onPress={() => {
            setWish(note);
            setWishing(true);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={note ? t('cart.wishEdit') : t('cart.wish')}
          style={{ alignSelf: 'flex-start' }}
        >
          {note ? (
            <Text style={s.wishText} numberOfLines={2}>
              «{note}»
            </Text>
          ) : (
            <Text style={[s.small, s.link]}>{t('cart.wish')}</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: { ...caps, color: scene.creamMuted },
  hint: {
    fontFamily: sceneFont.uiText,
    ...scale.caption,
    color: scene.creamMuted,
    paddingHorizontal: 24,
  },
  emptyCta: {
    alignSelf: 'flex-start',
    height: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    justifyContent: 'center',
    marginTop: 8,
    ...shadow.paper,
  },
  emptyCtaText: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
  paper: {
    marginHorizontal: 24,
    backgroundColor: scene.paper,
    borderRadius: radius.paper,
    padding: 18,
    paddingBottom: 16,
    gap: 4,
    ...shadow.paper,
  },
  // The torn edge off the printer: the ground shows through the perforation.
  perforation: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -1,
    height: 3,
    borderStyle: 'dashed',
    borderTopWidth: 3,
    borderColor: ground(1),
    opacity: 0.35,
  },
  paperTitle: { fontFamily: sceneFont.display, ...scale.title, color: scene.ink },
  paperDate: { ...caps, color: scene.inkSoft, fontVariant: ['tabular-nums'] },
  stamp: {
    position: 'absolute',
    right: 16,
    top: 36,
    color: scene.pomegranate,
    borderWidth: 2.5,
    borderColor: scene.pomegranate,
    borderRadius: radius.paper,
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...caps,
    transform: [{ rotate: '-10deg' }],
    opacity: 0.85,
  },
  vendor: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  vendorPhoto: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: scene.ochre,
    backgroundColor: scene.kraft,
  },
  vendorName: { fontFamily: sceneFont.display, ...scale.body, color: scene.ink },
  vendorMeta: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.inkSoft },
  clear: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.inkSoft },
  row: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: scene.paperEdge,
    gap: 8,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, backgroundColor: scene.kraft },
  // Names on a receipt are Alegreya; the sums beside them are Manrope in tabular figures.
  rowName: { fontFamily: sceneFont.display, ...scale.lead, color: scene.ink },
  rowPrice: {
    fontFamily: sceneFont.ui,
    ...scale.lead,
    color: scene.ink,
    marginLeft: 'auto',
    fontVariant: ['tabular-nums'],
  },
  small: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  link: { fontFamily: sceneFont.uiHeavy, color: scene.pomegranate },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: scene.kraft,
    borderRadius: radius.pill,
    padding: 3,
  },
  step: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: scene.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.caption,
    color: scene.ink,
    minWidth: 54,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  // The customer's own words to the stall, in the hand of the receipt's notes.
  wishText: { fontFamily: sceneFont.italic, ...scale.body, color: scene.ink },
  // A field on the receipt: kraft, the paper's edge.
  askInput: {
    flex: 1,
    height: 32,
    borderRadius: radius.paper,
    backgroundColor: scene.kraft,
    borderWidth: 1,
    borderColor: scene.paperEdge,
    paddingHorizontal: 8,
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.ink,
    ...(noOutline as object),
  },
  totals: { marginTop: 8, paddingTop: 10, borderTopWidth: 2, borderColor: scene.ink, gap: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  totalLabel: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.inkSoft },
  totalValue: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: scene.ink,
    fontVariant: ['tabular-nums'],
  },
  grand: { fontFamily: sceneFont.display, ...scale.title, color: scene.ink },
  grandValue: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.title,
    color: scene.ink,
    fontVariant: ['tabular-nums'],
  },
  bottom: { position: 'absolute', left: 20, right: 20, gap: 8 },
  chip: {
    flex: 1,
    height: 50,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipText: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.cream,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  cta: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  // Over the ground the button lifts; on a receipt it lies flat.
  ctaLift: shadow.paper,
  ctaOnPaper: { marginTop: 12 },
  ctaLabel: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
  ctaSum: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: scene.cream,
    fontVariant: ['tabular-nums'],
  },
});
