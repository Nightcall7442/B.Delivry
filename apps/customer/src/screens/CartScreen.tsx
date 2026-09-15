/**
 * The basket, one white card per stall: a bazaar order is picked up at one
 * place, so two stalls are two courier trips and two orders. One stall (or one
 * bazaar) gets a sticky "Оформить · total" button.
 */
import {
  decodeShare,
  encodeShare,
  estimateDelivery,
  haggleFor,
  sameBazaar,
  tr,
  type CartLine,
  unitLabel,
} from '@bazar/storefront';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import {
  Button,
  Field,
  Leaf,
  Line,
  Minus,
  Photo,
  Plus,
  Share as ShareIcon,
  Text,
  api,
  color,
  useAuth,
  useLocale,
  Basket,
} from '@bazar/mobile';
import { isApiError, room } from '@bazar/api-client';
import { WS_EVENT, type HaggleDto } from '@bazar/types';

import { FreeDeliveryBar } from '@/components/shop/FreeDeliveryBar';
import { Card, Page, ui, Glyph } from '@/components/ui/Page';

import { useAddress } from '@/features/address/store';
import {
  groupByStore,
  useCartActions,
  useCartQuantities,
  useCartReady,
} from '@/features/cart/store';
import { listProducts, listStores } from '@/lib/catalog';
import { useData } from '@/lib/use-data';

const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'http://localhost:3000';

export function CartScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user } = useAuth();
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
  const products = useData(() => listProducts(), []) ?? [];
  // Семейная корзина: a `?share=` link merges the sender's cart into this one, once.
  const { share } = useLocalSearchParams<{ share?: string }>();
  // A deep link mounts this screen before the navigator is ready to take setParams.
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
  const stores = useData(() => listStores(), []) ?? [];

  const groups = useMemo(() => groupByStore(products, quantities), [products, quantities]);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  // Cross-bazaar: the first cluster of stalls within one bazaar → one courier trip on offer.
  const oneTrip = useMemo(() => {
    for (const lead of groups) {
      const leadPoint = storeById.get(lead.storeId)?.point;
      if (!leadPoint) continue;
      const mates = groups.filter((g) => {
        const point = g === lead ? null : storeById.get(g.storeId)?.point;
        return point ? sameBazaar([leadPoint, point]) : false;
      });
      if (mates.length > 0) return [lead.storeId, ...mates.map((g) => g.storeId)];
    }
    return null;
  }, [groups, storeById]);
  const estimates = groups.map((group) => {
    const store = storeById.get(group.storeId);
    return store && address
      ? estimateDelivery(
          store.point,
          address.point,
          store.preparationMinutes,
          group.subtotal.amount,
        )
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
  // One stall, or every stall on one bazaar: a single sticky button; otherwise each card has its own.
  const footer =
    groups.length === 1 ? (
      <Button
        label={t('cart.checkout')}
        trailing={t.money(grandTotal)}
        style={{ justifyContent: 'space-between' }}
        onPress={() => toCheckout([groups[0]!.storeId])}
      />
    ) : oneTrip && oneTrip.length === groups.length ? (
      <Button
        label={t('cart.checkout')}
        trailing={t.money(grandTotal)}
        style={{ justifyContent: 'space-between' }}
        onPress={() => toCheckout(oneTrip)}
      />
    ) : undefined;

  return (
    <Page
      tabs
      back="history"
      title={t('cart.title')}
      right={
        groups.length > 0 ? (
          <Pressable onPress={shareCart} style={s.round} hitSlop={6}>
            <ShareIcon size={20} />
          </Pressable>
        ) : undefined
      }
      footer={footer}
    >
      {groups.length === 0 ? (
        <Card style={s.empty}>
          <Glyph icon={Basket} size={84} />
          <Text role="title" style={{ marginTop: 12 }}>
            {t('cart.empty')}
          </Text>
          <Text role="muted" style={{ marginTop: 4, textAlign: 'center' }}>
            {t('cart.emptyHint')}
          </Text>
          <Button
            label={t('common.toStores')}
            style={{ marginTop: 24, alignSelf: 'stretch' }}
            onPress={() => router.replace('/')}
          />
        </Card>
      ) : (
        <>
          {groups.length > 1 ? (
            <Text role="muted" style={{ marginTop: 6 }}>
              {oneTrip && footer
                ? t('cart.oneTripHint', { count: oneTrip.length })
                : t('cart.multi')}
            </Text>
          ) : null}
          {oneTrip && !footer ? (
            <>
              <Button
                label={t('cart.oneTrip')}
                style={{ marginTop: 10 }}
                onPress={() => toCheckout(oneTrip)}
              />
              <Text role="caption" style={{ marginTop: 6 }}>
                {t('cart.oneTripHint', { count: oneTrip.length })}
              </Text>
            </>
          ) : null}
          {notice ? (
            <Text role="muted" style={{ marginTop: 8, color: ui.brandDeep, fontWeight: '500' }}>
              {notice}
            </Text>
          ) : null}
          {groups.map((group, i) => {
            const store = storeById.get(group.storeId);
            const ids = [...group.lines, ...group.unavailable].map((l) => l.product.id);
            const estimate = estimates[i];
            const total = group.subtotal.amount + (estimate?.fee.amount ?? 0);

            return (
              <Card key={group.storeId} style={s.group}>
                <View style={s.groupHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text role="title" numberOfLines={1}>
                      {store ? tr(store.name, locale) : group.storeId}
                    </Text>
                    <Text role="caption">
                      {t.n('cart.items', group.lines.length)}
                      {estimate ? ` · ${t('common.eta', { minutes: estimate.etaMinutes })}` : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => clear(ids)} hitSlop={8}>
                    <Text role="muted" style={{ color: color.inkFaint }}>
                      {t('cart.clear')}
                    </Text>
                  </Pressable>
                </View>

                {group.lines.map((line) => (
                  <CartRow
                    key={line.product.id}
                    line={line}
                    haggle={haggleFor(haggles, line.product.id)}
                    onAsk={ask}
                    onChange={(q) => setQuantity(line.product.id, q)}
                  />
                ))}

                {haggleError ? (
                  <Text role="caption" style={{ color: color.danger, marginTop: 4 }}>
                    {haggleError}
                  </Text>
                ) : null}
                {group.unavailable.length > 0 ? (
                  <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    <Text role="caption">
                      {t('cart.unavailable')}{' '}
                      {group.unavailable.map((l) => tr(l.product.name, locale)).join(', ')}.
                    </Text>
                    <Pressable
                      onPress={() => clear(group.unavailable.map((l) => l.product.id))}
                      hitSlop={8}
                    >
                      <Text role="caption" style={{ textDecorationLine: 'underline' }}>
                        {t('common.remove')}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                <FreeDeliveryBar subtotal={group.subtotal.amount} style={{ marginTop: 12 }} />

                <View style={s.totals}>
                  <Line label={t('cart.goods')} value={t.money(group.subtotal.amount)} />
                  <Line
                    label={t('cart.delivery')}
                    value={estimate ? t.money(estimate.fee.amount) : t('cart.afterAddress')}
                  />
                  <Line label={t('cart.total')} value={t.money(total)} strong />
                </View>

                {footer ? null : (
                  <Button
                    label={t('cart.checkout')}
                    trailing={t.money(total)}
                    style={{ marginTop: 12, justifyContent: 'space-between' }}
                    onPress={() => toCheckout([group.storeId])}
                  />
                )}
              </Card>
            );
          })}
          <Text role="caption" style={{ marginTop: 12, textAlign: 'center' }}>
            {t('cart.shareHint')}
          </Text>
        </>
      )}
    </Page>
  );
}

function CartRow({
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
  const { product, quantity } = line;
  const step = product.quantityStep || 1;
  const min = product.minQuantity || step;
  const unit = unitLabel(locale)[product.unit];

  return (
    <View style={s.row}>
      <Photo
        uri={product.images[0]?.url}
        style={s.thumb}
        fallback={<Leaf color={color.sand300} />}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text role="body" numberOfLines={2} style={s.name}>
          {tr(product.name, locale)}
        </Text>
        <Text role="caption">
          {t.money(product.price.amount)} / {unit}
        </Text>
        <View style={s.rowBottom}>
          <Text role="price" style={{ fontSize: 16, lineHeight: 20 }}>
            {t.money(line.total.amount)}
          </Text>
          <View style={s.stepper}>
            <Pressable
              onPress={() => onChange(quantity - step < min ? 0 : quantity - step)}
              style={s.step}
              hitSlop={6}
            >
              <Minus size={14} color={ui.brandDeep} strokeWidth={2.6} />
            </Pressable>
            <Text role="caption" style={s.stepValue} numberOfLines={1}>
              {t.qty(quantity)} {unit}
            </Text>
            <Pressable onPress={() => onChange(quantity + step)} style={s.step} hitSlop={6}>
              <Plus size={14} color={ui.brandDeep} strokeWidth={2.6} />
            </Pressable>
          </View>
        </View>
        {product.stock !== null && quantity > product.stock ? (
          <Text role="caption" style={{ color: color.danger }}>
            {t('store.left', { count: product.stock ?? 0 })}
          </Text>
        ) : null}
        {haggle?.status === 'ACCEPTED' && haggle.offeredPrice ? (
          <Text role="caption" style={{ color: ui.brandDeep, fontWeight: '500' }}>
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
          <Text role="caption">
            {t('haggle.pending', { price: t.money(haggle.askedPrice.amount), unit })}
          </Text>
        ) : haggle?.status === 'DECLINED' ? (
          <Text role="caption">{t('haggle.declined')}</Text>
        ) : asking ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <Field
              value={price}
              onChangeText={(v) => setPrice(v.replace(/\D/g, ''))}
              placeholder={t('haggle.placeholder', { unit })}
              keyboardType="number-pad"
              style={{ flex: 1, height: 36 }}
            />
            <Pressable
              onPress={() => {
                const minor = Number(price) * 100;
                if (minor > 0) void onAsk(product.id, minor).then(() => setAsking(false));
              }}
              hitSlop={6}
            >
              <Text role="caption" style={{ color: ui.brandDeep, fontWeight: '500' }}>
                {t('haggle.send')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setAsking(true)} hitSlop={6} style={{ marginTop: 4 }}>
            <Text role="caption" style={{ color: ui.brandDeep }}>
              {t('haggle.ask')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', padding: 24, paddingVertical: 40, marginTop: 8 },
  group: { marginTop: 12, padding: 14 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: color.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  rowBottom: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.raise,
    borderRadius: 17,
    height: 34,
    paddingHorizontal: 4,
  },
  step: { width: 28, height: 26, alignItems: 'center', justifyContent: 'center' },
  stepValue: {
    minWidth: 40,
    textAlign: 'center',
    color: ui.brandDeep,
    fontWeight: '700',
    fontSize: 13,
  },
  totals: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    gap: 2,
  },
});
