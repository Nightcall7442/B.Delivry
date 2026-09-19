/**
 * Checkout for one stall: address, door details, when, how to pay, the total —
 * and a single button. The total is the API's quote, not a guess; the order is
 * the API's row, so the waiting screen is real from the first second.
 */
import {
  PAYMENT_METHOD,
  SUBSTITUTION_POLICY,
  type PaymentMethod,
  type SubstitutionPolicy,
} from '@bazar/constants';
import {
  addressLabel,
  combineQuotes,
  defaultSubstitution,
  deliverySlots,
  describeOrderError,
  ensureServerAddress,
  forgottenProducts,
  haggleFor,
  orderReasonText,
  paymentMethodText,
  plusActive,
  substitutionText,
  TOP_UP_KG,
  tr,
} from '@bazar/storefront';
import type { HaggleDto, OrderQuoteDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ui, Glyph } from '@/components/ui/Page';

import {
  Banknote,
  Button,
  Card,
  Check,
  Chip,
  Field,
  Home,
  Line,
  Panel,
  Photo,
  Row,
  Smartphone,
  Text,
  api,
  color,
  useAuth,
  useLocale,
  Wallet,
} from '@bazar/mobile';
import { FreeDeliveryBar } from '@/components/shop/FreeDeliveryBar';
import { Shell } from '@/components/ui/Shell';

import { useAddress } from '@/features/address/store';
import { groupByStore, useCartActions, useCartQuantities } from '@/features/cart/store';
import { useOrderList } from '@/features/orders/store';
import { getStore, listProducts } from '@/lib/catalog';
import { useData } from '@/lib/use-data';

const SUBSTITUTION_OPTIONS = [
  SUBSTITUTION_POLICY.CALL,
  SUBSTITUTION_POLICY.REPLACE,
  SUBSTITUTION_POLICY.REMOVE,
] as const;

const METHODS: ReadonlyArray<{ method: PaymentMethod; icon: ReactNode }> = [
  { method: PAYMENT_METHOD.CASH, icon: <Banknote color={color.brand600} /> },
  { method: PAYMENT_METHOD.CARD, icon: <Card color={color.brand600} /> },
  { method: PAYMENT_METHOD.ONLINE, icon: <Smartphone color={color.brand600} /> },
];

export function CheckoutScreen({
  storeId,
  extraStoreIds = [],
}: {
  storeId: string;
  /** Cross-bazaar: the other stalls of this trip; empty for an ordinary checkout. */
  extraStoreIds?: readonly string[];
}) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const substitution = substitutionText(locale);
  const { user, ready: authReady } = useAuth();
  const { address, setAddress } = useAddress();
  const quantities = useCartQuantities();
  const { clear, setQuantity } = useCartActions();
  const { orders: pastOrders } = useOrderList();
  // Agreed (haggled) prices: the quote already uses them; the lines should show the same.
  const [haggles, setHaggles] = useState<HaggleDto[]>([]);
  useEffect(() => {
    if (!user) return;
    api()
      .haggle.mine()
      .then(setHaggles)
      .catch(() => undefined);
  }, [user]);
  const lineTotal = (line: {
    product: { id: string };
    quantity: number;
    total: { amount: number };
  }) => {
    const agreed = haggleFor(haggles, line.product.id);
    return agreed?.status === 'ACCEPTED' && agreed.offeredPrice
      ? Math.round(agreed.offeredPrice.amount * line.quantity)
      : line.total.amount;
  };

  const store = useData(() => getStore(storeId), [storeId]);
  const extraKey = extraStoreIds.join(',');
  const extraStores =
    useData(
      () =>
        Promise.all(extraStoreIds.map((id) => getStore(id))).then((rows) =>
          rows.filter((r) => r !== null),
        ),
      [extraKey],
    ) ?? [];
  const products =
    useData(
      () =>
        Promise.all([storeId, ...extraStoreIds].map((id) => listProducts({ storeId: id }))).then(
          (lists) => lists.flat(),
        ),
      [storeId, extraKey],
    ) ?? [];
  const allGroups = useMemo(() => groupByStore(products, quantities), [products, quantities]);
  const group = useMemo(
    () => allGroups.find((g) => g.storeId === storeId) ?? null,
    [allGroups, storeId],
  );
  // Followers of a cross-bazaar trip, in the order the link named them.
  const followers = useMemo(
    () =>
      extraStores.flatMap((row) => {
        const g = allGroups.find((entry) => entry.storeId === row.id);
        return g && g.lines.length > 0 ? [{ store: row, group: g }] : [];
      }),
    [extraStores, allGroups],
  );
  const toItems = (g: { lines: { product: { id: string }; quantity: number }[] } | null) =>
    g?.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })) ?? [];
  const items = useMemo(() => toItems(group), [group]);
  const groupStores = useMemo(
    () => [
      { storeId, items },
      ...followers.map((f) => ({ storeId: f.store.id, items: toItems(f.group) })),
    ],
    [storeId, items, followers],
  );
  // B2B: pay by invoice once an operator approved the company.
  const [business, setBusiness] = useState(false);
  useEffect(() => {
    if (!user?.customerId) return;
    api()
      .customers.me()
      .then((me) => setBusiness(me.businessApprovedAt !== null && me.creditLimit > 0))
      .catch(() => undefined);
  }, [user?.customerId]);

  const [payment, setPayment] = useState<PaymentMethod>(PAYMENT_METHOD.CASH);
  const [slot, setSlot] = useState<string | null>(null);
  const slots = useMemo(() => deliverySlots(new Date(), locale), [locale]);
  const [comment, setComment] = useState('');
  const [vendorComment, setVendorComment] = useState('');
  // "Заказ родителям": somebody else opens the door.
  const [forSomeone, setForSomeone] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  // Pay from balance: cashback, refunds, referral bonuses. Charged after weighing.
  const [balance, setBalance] = useState(0);
  useEffect(() => {
    if (!user) return;
    api()
      .payments.balance()
      .then((wallet) => setBalance(wallet.amount))
      .catch(() => undefined);
  }, [user]);
  const [policy, setPolicy] = useState<SubstitutionPolicy>('CALL');
  // A shop swaps a missing item for the same thing; at a stall the seller calls first.
  useEffect(() => {
    if (store) setPolicy(defaultSubstitution(store));
  }, [store]);
  const [apartment, setApartment] = useState(address?.apartment ?? '');
  const [entrance, setEntrance] = useState(address?.entrance ?? '');
  const [quote, setQuote] = useState<OrderQuoteDto | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const here = `/checkout?store=${storeId}${extraKey ? `&stores=${extraKey}` : ''}`;

  // No account, no order: the API ties every order to a customer.
  useEffect(() => {
    if (authReady && !user) router.replace({ pathname: '/login', params: { next: here } });
  }, [authReady, user, router, here]);

  // Re-quote whenever the basket or the address changes; the API owns the numbers.
  useEffect(() => {
    if (!user || !store || !address || items.length === 0) {
      setQuote(null);
      return;
    }
    let alive = true;
    setQuoting(true);
    const request =
      followers.length > 0
        ? api()
            .orders.quoteGroup({ point: address.point, stores: groupStores })
            .then((quotes) => combineQuotes(quotes))
        : api().orders.quote({ storeId: store.id, point: address.point, items });
    request
      .then((result) => alive && setQuote(result))
      .catch((e) => alive && setError(describeOrderError(e, locale)))
      .finally(() => alive && setQuoting(false));
    return () => {
      alive = false;
    };
  }, [user, store, address, items, followers.length, groupStores]);

  const orderLines = [...(group?.lines ?? []), ...followers.flatMap((f) => f.group.lines)];
  const weightKg = orderLines
    .filter((line) => line.product.unit === 'KG')
    .reduce((sum, line) => sum + line.quantity, 0);
  const totals = quote?.totals;
  const deliverable = quote?.deliverable ?? false;
  const subtotal = totals?.subtotal.amount ?? group?.subtotal.amount ?? 0;
  const total = totals?.total.amount ?? subtotal;
  const ready = Boolean(
    user && store && group && address && items.length > 0 && deliverable && !submitting && !quoting,
  );

  const submit = async () => {
    if (!store || !group || !address) return;
    setSubmitting(true);
    setError(null);
    try {
      const home = { ...address, apartment: apartment.trim(), entrance: entrance.trim() };
      const addressId = await ensureServerAddress(api(), home, setAddress);
      const common = {
        addressId,
        paymentMethod: payment,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(vendorComment.trim() ? { vendorComment: vendorComment.trim() } : {}),
        substitutionPolicy: policy,
        ...(slot ? { scheduledFor: slot } : {}),
        ...(forSomeone && recipientPhone.trim()
          ? { recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim() }
          : {}),
      };
      const order =
        followers.length > 0
          ? (await api().orders.createGroup({ ...common, stores: groupStores }))[0]!
          : await api().orders.create({ ...common, storeId: store.id, items });
      clear(
        [group, ...followers.map((f) => f.group)].flatMap((g) =>
          g.lines.map((line) => line.product.id),
        ),
      );
      router.replace({ pathname: '/order/[orderId]', params: { orderId: order.id } });
    } catch (e) {
      setError(describeOrderError(e, locale));
      setSubmitting(false);
    }
  };

  return (
    <Shell
      back="/cart"
      header={<Text role="display">{t('checkout.title')}</Text>}
      footer={
        <Button
          label={
            address
              ? quoting
                ? t('checkout.calculating')
                : t('checkout.order')
              : t('checkout.needAddress')
          }
          trailing={t.money(total)}
          style={{ justifyContent: 'space-between' }}
          disabled={!ready}
          onPress={submit}
        />
      }
    >
      {error ? (
        <Text role="muted" style={{ color: color.danger, marginBottom: 8 }}>
          {error}
        </Text>
      ) : null}
      {quote && !quote.deliverable ? (
        <Text role="muted" style={{ color: color.danger, marginBottom: 8 }}>
          {orderReasonText(quote.reason, locale) ?? quote.reason ?? t('checkout.undeliverable')}
          {quote.reason?.includes('minimum')
            ? t('checkout.minimum', { amount: t.money(quote.minOrder.amount) })
            : ''}
        </Text>
      ) : null}
      <Panel style={s.card}>
        <Row
          icon={<Home size={22} color={color.saffron600} />}
          tone="saffron"
          eyebrow={t('checkout.where')}
          title={address ? addressLabel(address.text) : t('home.setAddress')}
          onPress={() => router.push({ pathname: '/address', params: { next: here } })}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Field
            style={{ flex: 1, height: 48 }}
            value={apartment}
            onChangeText={setApartment}
            placeholder={t('checkout.apartment')}
            keyboardType="number-pad"
          />
          <Field
            style={{ flex: 1, height: 48 }}
            value={entrance}
            onChangeText={setEntrance}
            placeholder={t('checkout.entrance')}
          />
        </View>
        <Field
          style={{ marginTop: 8, height: 72, alignItems: 'flex-start', paddingVertical: 12 }}
          value={comment}
          onChangeText={setComment}
          placeholder={t('checkout.courierComment')}
          multiline
        />
      </Panel>

      {user && balance > 0 ? (
        <Panel style={[s.card, s.balance]}>
          <Glyph icon={Wallet} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text role="body" style={{ fontWeight: '600' }}>
              {t('checkout.spendBalance')}
            </Text>
            <Text role="caption">
              {balance >= total
                ? t('checkout.balanceHave', { amount: t.money(balance) })
                : t('checkout.balanceShort', { amount: t.money(balance) })}
            </Text>
          </View>
          <Switch
            value={payment === PAYMENT_METHOD.BALANCE}
            disabled={balance < total}
            onValueChange={(on) => setPayment(on ? PAYMENT_METHOD.BALANCE : PAYMENT_METHOD.CASH)}
            trackColor={{ true: color.brand500, false: color.lineStrong }}
            thumbColor={color.white}
            accessibilityLabel={t('checkout.spendBalance')}
          />
        </Panel>
      ) : null}

      <Text role="title" style={s.head}>
        {t('checkout.when')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}
      >
        <Chip
          label={`${t('checkout.asap')}${quote?.deliverable ? ` · ${t('common.eta', { minutes: quote.etaMinutes })}` : ''}`}
          active={slot === null}
          onPress={() => setSlot(null)}
        />
        {slots.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            active={slot === option.startsAt}
            onPress={() => setSlot(option.startsAt)}
          />
        ))}
      </ScrollView>
      {slot ? (
        <Text role="caption" style={{ marginTop: 8 }}>
          {t('checkout.slotHint')}
        </Text>
      ) : null}

      <Text role="title" style={s.head}>
        {t('checkout.payment')}
      </Text>
      <Panel style={{ paddingVertical: 4 }}>
        {[
          ...METHODS,
          ...(balance > 0
            ? [{ method: PAYMENT_METHOD.BALANCE, icon: <Card color={color.brand600} /> }]
            : []),
          ...(business
            ? [{ method: PAYMENT_METHOD.INVOICE, icon: <Banknote color={color.brand600} /> }]
            : []),
        ].map(({ method, icon }) => {
          const text = paymentMethodText(locale)[method];
          const active = payment === method;
          return (
            <Row
              key={method}
              icon={icon}
              tone="brand"
              title={
                method === PAYMENT_METHOD.BALANCE
                  ? t('payment.BALANCE.withAmount', { amount: t.money(balance) })
                  : text.title
              }
              subtitle={text.hint}
              chevron={false}
              trailing={
                <View
                  style={[
                    s.radio,
                    active && { backgroundColor: color.brand500, borderColor: color.brand500 },
                  ]}
                >
                  {active ? <Check size={14} color={color.white} strokeWidth={3} /> : null}
                </View>
              }
              onPress={() => setPayment(method)}
            />
          );
        })}
        {payment === PAYMENT_METHOD.ONLINE ? (
          <Text role="muted" style={{ marginBottom: 8, paddingHorizontal: 4 }}>
            {t('checkout.onlineHint')}
          </Text>
        ) : null}
      </Panel>

      <Text role="title" style={s.head}>
        {t('checkout.vendor')}
      </Text>
      <Panel style={s.card}>
        <Field
          style={{ height: 72, alignItems: 'flex-start', paddingVertical: 12 }}
          value={vendorComment}
          onChangeText={setVendorComment}
          placeholder={t('checkout.vendorComment')}
          multiline
        />
        <Text
          role="caption"
          style={{ marginTop: 12, textTransform: 'uppercase', letterSpacing: 1 }}
        >
          {t('checkout.ifMissing')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {SUBSTITUTION_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={substitution[option].title}
              active={policy === option}
              onPress={() => setPolicy(option)}
            />
          ))}
        </View>
        <Text role="caption" style={{ marginTop: 4 }}>
          {substitution[policy].hint}
        </Text>

        <Pressable
          onPress={() => setForSomeone((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}
          accessibilityRole="switch"
          accessibilityState={{ checked: forSomeone }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: forSomeone ? color.brand500 : color.lineStrong,
              backgroundColor: forSomeone ? color.brand500 : color.white,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {forSomeone ? (
              <Text style={{ color: color.white, fontSize: 14, lineHeight: 16 }}>✓</Text>
            ) : null}
          </View>
          <Text role="title">{t('checkout.forSomeone')}</Text>
        </Pressable>
        {forSomeone ? (
          <>
            <Text role="caption" style={{ marginTop: 4 }}>
              {t('checkout.forSomeoneHint')}
            </Text>
            <Field
              style={{ marginTop: 8 }}
              value={recipientName}
              onChangeText={setRecipientName}
              placeholder={t('checkout.recipientName')}
            />
            <Field
              style={{ marginTop: 8 }}
              value={recipientPhone}
              onChangeText={setRecipientPhone}
              placeholder={t('checkout.recipientPhone')}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          </>
        ) : null}
      </Panel>

      <Text role="title" style={s.head}>
        {t('checkout.orderTitle')}
      </Text>
      <Panel style={s.card}>
        {orderLines.length > 0 ? (
          <View style={s.thumbs}>
            {orderLines.slice(0, 6).map((line) => (
              <Photo key={line.product.id} uri={line.product.images[0]?.url} style={s.thumb} />
            ))}
            {orderLines.length > 6 ? (
              <View style={[s.thumb, s.thumbMore]}>
                <Text role="caption" style={{ fontWeight: '700', color: ui.brandDeep }}>
                  +{orderLines.length - 6}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {followers.length > 0 && store ? (
          <Text
            role="caption"
            style={{ marginBottom: 8, color: color.brand600, fontWeight: '500' }}
          >
            {t('checkout.oneTrip', {
              stores: [store, ...followers.map((f) => f.store)]
                .map((s) => tr(s.name, locale))
                .join(' + '),
            })}
          </Text>
        ) : null}
        {followers.map((f) => (
          <View key={f.store.id}>
            <Text role="title">{tr(f.store.name, locale)}</Text>
            <View style={{ marginTop: 4 }}>
              {f.group.lines.map((line) => (
                <View key={line.product.id} style={s.item}>
                  <Text role="muted" numberOfLines={1} style={{ flex: 1, color: color.ink }}>
                    {tr(line.product.name, locale)}{' '}
                    <Text role="muted">× {t.qty(line.quantity)}</Text>
                  </Text>
                  <Text role="muted" style={{ color: color.ink }}>
                    {t.money(lineTotal(line))}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        {store ? (
          <Text role="title" style={followers.length > 0 ? { marginTop: 16 } : undefined}>
            {tr(store.name, locale)}
          </Text>
        ) : null}
        <View style={{ marginTop: 4 }}>
          {group?.lines.map((line) => (
            <View key={line.product.id} style={s.item}>
              <Text role="muted" numberOfLines={1} style={{ flex: 1, color: color.ink }}>
                {tr(line.product.name, locale)} <Text role="muted">× {t.qty(line.quantity)}</Text>
              </Text>
              {line.product.unit === 'KG' ? (
                <Pressable
                  onPress={() =>
                    setQuantity(
                      line.product.id,
                      Math.round((line.quantity + TOP_UP_KG) * 100) / 100,
                    )
                  }
                  hitSlop={6}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: ui.brandSoft,
                  }}
                >
                  <Text role="caption" style={{ color: color.brand600 }}>
                    {t('checkout.topUp')}
                  </Text>
                </Pressable>
              ) : null}
              <Text role="muted" style={{ color: color.ink }}>
                {t.money(lineTotal(line))}
              </Text>
            </View>
          ))}
        </View>
        {(() => {
          const forgot = forgottenProducts(
            pastOrders,
            storeId,
            new Set(group?.lines.map((line) => line.product.id) ?? []),
            products,
          );
          if (forgot.length === 0) return null;
          return (
            <View style={{ marginTop: 12 }}>
              <Text role="caption">
                {t('checkout.forgot')} · {t('checkout.forgotHint')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -16, marginTop: 6 }}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
              >
                {forgot.map((product) => (
                  <Chip
                    key={product.id}
                    label={`+ ${tr(product.name, locale)}`}
                    onPress={() =>
                      setQuantity(product.id, product.minQuantity || product.quantityStep || 1)
                    }
                  />
                ))}
              </ScrollView>
            </View>
          );
        })()}
        {!group || group.lines.length === 0 ? (
          <Pressable
            onPress={() => router.replace({ pathname: '/store/[storeId]', params: { storeId } })}
          >
            <Text role="muted" style={{ marginTop: 8 }}>
              {t('checkout.emptyStore')}{' '}
              <Text role="muted" style={{ textDecorationLine: 'underline' }}>
                {t('checkout.addItems')}
              </Text>
            </Text>
          </Pressable>
        ) : null}

        {plusActive(user) ? (
          <Text role="caption" style={{ marginTop: 12, color: color.brand600, fontWeight: '500' }}>
            ✓ {t('checkout.plusDelivery')}
          </Text>
        ) : quote ? (
          <FreeDeliveryBar
            subtotal={quote.totals.subtotal.amount}
            threshold={quote.freeDeliveryThreshold}
            style={{ marginTop: 12, backgroundColor: ui.brandSoft }}
          />
        ) : null}

        <View style={s.totals}>
          <Line
            label={
              group
                ? weightKg > 0
                  ? t('checkout.weightLine', {
                      items: t.n('cart.items', orderLines.length),
                      weight: t.qty(weightKg),
                    })
                  : t.n('cart.items', orderLines.length)
                : t('cart.goods')
            }
            value={t.money(subtotal)}
          />
          <Line
            label={`${t('cart.delivery')}${quote ? ` · ${t('common.km', { km: (quote.distanceMeters / 1000).toFixed(1) })}` : ''}`}
            value={totals ? t.money(totals.deliveryFee.amount) : '—'}
          />
          {totals && totals.serviceFee.amount > 0 ? (
            <Line label={t('checkout.serviceFee')} value={t.money(totals.serviceFee.amount)} />
          ) : null}
          {quote?.heavy ? (
            <Text role="caption" style={{ color: color.brand600 }}>
              {t('shop.heavy', { sum: t.money(quote.heavySurcharge.amount) })}
            </Text>
          ) : null}
          <Line label={t('cart.total')} value={t.money(total)} strong />
        </View>
      </Panel>
      <Text role="caption" style={{ marginTop: 12, paddingBottom: 8 }}>
        {t('checkout.weighNote')}{' '}
        <Text
          role="caption"
          style={{ textDecorationLine: 'underline' }}
          onPress={() => router.push('/rules')}
        >
          {t('checkout.rulesLink')}
        </Text>
      </Text>
    </Shell>
  );
}

const s = StyleSheet.create({
  card: { padding: ui.pad },
  balance: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbs: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  thumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: color.field },
  thumbMore: { backgroundColor: ui.brandSoft, alignItems: 'center', justifyContent: 'center' },
  head: { marginTop: 20, marginBottom: 10 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  totals: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    gap: 2,
  },
});
