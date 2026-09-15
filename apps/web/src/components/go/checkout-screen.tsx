/**
 * Checkout for one stall: address, door details, when, how to pay, the total —
 * and a single button. The total is the API's quote, not a guess; the order is
 * the API's order. Signed-out visitors go through login and come back here.
 */
'use client';

import {
  PAYMENT_METHOD,
  SUBSTITUTION_POLICY,
  type PaymentMethod,
  type SubstitutionPolicy,
} from '@bazar/constants';
import {
  TOP_UP_KG,
  addressLabel,
  combineQuotes,
  deliverySlots,
  describeOrderError,
  ensureServerAddress,
  forgottenProducts,
  haggleFor,
  orderReasonText,
  paymentMethodText,
  plusActive,
  substitutionText,
  tr,
  type MapStoreDto,
} from '@bazar/storefront';
import type { HaggleDto, OrderQuoteDto, ProductDto } from '@bazar/types';
import { createT } from '@bazar/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { FreeDeliveryBar } from '@/components/go/free-delivery-bar';
import { GoShell } from '@/components/go/go-shell';
import { Banknote, Card, Check, Chevron, HomeGlyph, Smartphone } from '@/components/go/icons';
import { DEFAULT_POINT, useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { groupByStore, useCartActions, useCartQuantities } from '@/features/cart';
import { useOrderList } from '@/features/orders';
import { api } from '@/lib/api';

const SUBSTITUTION_OPTIONS = [
  SUBSTITUTION_POLICY.CALL,
  SUBSTITUTION_POLICY.REPLACE,
  SUBSTITUTION_POLICY.REMOVE,
] as const;

const METHODS: ReadonlyArray<{ method: PaymentMethod; icon: ReactNode }> = [
  { method: PAYMENT_METHOD.CASH, icon: <Banknote /> },
  { method: PAYMENT_METHOD.CARD, icon: <Card /> },
  { method: PAYMENT_METHOD.ONLINE, icon: <Smartphone /> },
];

export function CheckoutScreen({
  store,
  extraStores = [],
  products,
  locale,
}: {
  store: MapStoreDto;
  /** Cross-bazaar: the other stalls of this trip; empty for an ordinary checkout. */
  extraStores?: readonly MapStoreDto[];
  products: readonly ProductDto[];
  locale: string;
}) {
  const t = createT(locale);
  const substitution = substitutionText(locale);
  const router = useRouter();
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

  const allGroups = useMemo(() => groupByStore(products, quantities), [products, quantities]);
  const group = useMemo(
    () => allGroups.find((g) => g.storeId === store.id) ?? null,
    [allGroups, store.id],
  );
  // Followers of a cross-bazaar trip, in the order the URL named them.
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
      { storeId: store.id, items },
      ...followers.map((f) => ({ storeId: f.store.id, items: toItems(f.group) })),
    ],
    [store.id, items, followers],
  );
  // B2B: pay by invoice once an operator approved the company.
  const [business, setBusiness] = useState<{ approved: boolean; days: number } | null>(null);
  useEffect(() => {
    if (!user?.customerId) return;
    api()
      .customers.me()
      .then((me) =>
        setBusiness({
          approved: me.businessApprovedAt !== null && me.creditLimit > 0,
          days: me.creditDays,
        }),
      )
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
  const [apartment, setApartment] = useState(address?.apartment ?? '');
  const [entrance, setEntrance] = useState(address?.entrance ?? '');
  const [quote, setQuote] = useState<OrderQuoteDto | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const here = `/${locale}/checkout?store=${store.id}${
    extraStores.length > 0 ? `&stores=${extraStores.map((s) => s.id).join(',')}` : ''
  }`;

  // No account, no order: the API ties every order to a customer.
  useEffect(() => {
    if (authReady && !user) router.replace(`/${locale}/login?next=${encodeURIComponent(here)}`);
  }, [authReady, user, router, locale, here]);

  // Re-quote whenever the basket or the address changes; the API owns the numbers.
  useEffect(() => {
    if (!user || !address || items.length === 0) {
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
  }, [user, address, items, store.id, followers.length, groupStores]);

  const totals = quote?.totals;
  const deliverable = quote?.deliverable ?? false;
  const ready = Boolean(
    user && group && address && items.length > 0 && deliverable && !submitting && !quoting,
  );

  const submit = async () => {
    if (!group || !address) return;
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
      router.replace(`/${locale}/orders/${order.id}`);
    } catch (e) {
      setError(describeOrderError(e, locale));
      setSubmitting(false);
    }
  };

  const markers = [
    { id: store.id, point: store.point, kind: 'store' as const, label: tr(store.name, locale) },
    ...followers.map((f) => ({ id: f.store.id, point: f.store.point, kind: 'store' as const })),
    ...(address ? [{ id: 'home', point: address.point, kind: 'home' as const }] : []),
  ];

  return (
    <GoShell
      locale={locale}
      back={`/${locale}/cart`}
      peek={0.62}
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('checkout.title')}</h1>
      }
      footer={
        <button
          type="button"
          className="btn-go justify-between px-5"
          disabled={!ready}
          onClick={submit}
        >
          <span>
            {!address
              ? t('checkout.needAddress')
              : submitting
                ? t('checkout.placing')
                : quoting
                  ? t('checkout.calculating')
                  : t('checkout.order')}
          </span>
          <span>{totals ? t.money(totals.total.amount) : ''}</span>
        </button>
      }
    >
      <Link
        href={`/${locale}/address?next=${encodeURIComponent(here)}`}
        className={`go-row -mx-3 mt-1 ${address ? '' : 'bg-saffron-100'}`}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-saffron-100 text-saffron-600">
          <HomeGlyph />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-ink-muted">{t('checkout.where')}</span>
          <span className="block truncate text-base font-medium">
            {address ? addressLabel(address.text) : t('home.setAddress')}
          </span>
        </span>
        <Chevron />
      </Link>

      {quote && !quote.deliverable ? (
        <p role="alert" className="mt-2 rounded-2xl bg-saffron-100 px-4 py-3 text-sm">
          {orderReasonText(quote.reason, locale) ?? quote.reason ?? t('checkout.undeliverable')}
          {quote.reason?.includes('minimum')
            ? t('checkout.minimum', { amount: t.money(quote.minOrder.amount) })
            : ''}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <input
          value={apartment}
          onChange={(e) => setApartment(e.target.value)}
          className="go-field h-12"
          placeholder={t('checkout.apartment')}
          inputMode="numeric"
        />
        <input
          value={entrance}
          onChange={(e) => setEntrance(e.target.value)}
          className="go-field h-12"
          placeholder={t('checkout.entrance')}
        />
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="go-field mt-2 h-auto resize-none py-3"
        placeholder={t('checkout.courierComment')}
      />

      <h2 className="mt-5 font-display text-base font-bold">{t('checkout.vendor')}</h2>
      <textarea
        value={vendorComment}
        onChange={(e) => setVendorComment(e.target.value)}
        rows={2}
        className="go-field mt-2 h-auto resize-none py-3"
        placeholder={t('checkout.vendorComment')}
      />
      <p className="mt-3 text-xs font-medium uppercase tracking-wider text-ink-muted">
        {t('checkout.ifMissing')}
      </p>
      <div className="mt-2 flex gap-2">
        {SUBSTITUTION_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className="go-chip h-10 flex-1 justify-center"
            aria-pressed={policy === option}
            title={substitution[option].hint}
            onClick={() => setPolicy(option)}
          >
            {substitution[option].title}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{substitution[policy].hint}</p>

      <label className="mt-5 flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={forSomeone}
          onChange={(e) => setForSomeone(e.target.checked)}
          className="h-5 w-5 accent-brand-500"
        />
        <span className="font-display text-base font-bold">{t('checkout.forSomeone')}</span>
      </label>
      {forSomeone ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">{t('checkout.forSomeoneHint')}</p>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="go-field mt-2 h-12"
            placeholder={t('checkout.recipientName')}
            autoComplete="name"
          />
          <input
            value={recipientPhone}
            onChange={(e) => setRecipientPhone(e.target.value)}
            className="go-field mt-2 h-12"
            placeholder={t('checkout.recipientPhone')}
            inputMode="tel"
            autoComplete="tel"
          />
        </>
      ) : null}

      <h2 className="mt-5 font-display text-base font-bold">{t('checkout.when')}</h2>
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          className="go-chip h-10 shrink-0"
          aria-pressed={slot === null}
          onClick={() => setSlot(null)}
        >
          {t('checkout.asap')}
          {quote?.deliverable ? ` · ${t('common.eta', { minutes: quote.etaMinutes })}` : ''}
        </button>
        {slots.map((option) => (
          <button
            key={option.id}
            type="button"
            className="go-chip h-10 shrink-0"
            aria-pressed={slot === option.startsAt}
            onClick={() => setSlot(option.startsAt)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {slot ? <p className="mt-2 text-xs text-ink-muted">{t('checkout.slotHint')}</p> : null}

      <h2 className="mt-5 font-display text-base font-bold">{t('checkout.payment')}</h2>
      <ul className="-mx-3 mt-1">
        {[
          ...METHODS,
          ...(balance > 0 ? [{ method: PAYMENT_METHOD.BALANCE, icon: <Card /> }] : []),
          ...(business?.approved ? [{ method: PAYMENT_METHOD.INVOICE, icon: <Banknote /> }] : []),
        ].map(({ method, icon }) => {
          const text = paymentMethodText(locale)[method];
          const active = payment === method;
          return (
            <li key={method}>
              <button
                type="button"
                className="go-row"
                onClick={() => setPayment(method)}
                aria-pressed={active}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sand-100 text-brand-700"
                  aria-hidden
                >
                  {icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base">
                    {method === PAYMENT_METHOD.BALANCE
                      ? t('payment.BALANCE.withAmount', { amount: t.money(balance) })
                      : text.title}
                  </span>
                  <span className="block text-xs text-ink-muted">{text.hint}</span>
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${active ? 'bg-brand-500 text-white' : 'border border-line-strong'}`}
                >
                  {active ? <Check /> : null}
                </span>
              </button>
            </li>
          );
        })}
        {payment === PAYMENT_METHOD.ONLINE ? (
          <p className="mt-2 px-3 text-sm text-ink-muted">{t('checkout.onlineHint')}</p>
        ) : null}
      </ul>

      {followers.length > 0 ? (
        <p className="mt-5 text-xs font-medium text-brand-700">
          {t('checkout.oneTrip', {
            stores: [store, ...followers.map((f) => f.store)]
              .map((s) => tr(s.name, locale))
              .join(' + '),
          })}
        </p>
      ) : null}
      {followers.map((f) => (
        <div key={f.store.id}>
          <h2 className="mt-4 font-display text-base font-bold">{tr(f.store.name, locale)}</h2>
          <ul className="mt-1 divide-y divide-line text-sm">
            {f.group.lines.map((line) => (
              <li key={line.product.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {tr(line.product.name, locale)}{' '}
                  <span className="text-ink-muted">× {line.quantity}</span>
                </span>
                <span className="shrink-0">{t.money(lineTotal(line))}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <h2 className="mt-5 font-display text-base font-bold">{tr(store.name, locale)}</h2>
      <ul className="mt-1 divide-y divide-line text-sm">
        {group?.lines.map((line) => (
          <li key={line.product.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">
              {tr(line.product.name, locale)}{' '}
              <span className="text-ink-muted">× {line.quantity}</span>
            </span>
            {line.product.unit === 'KG' ? (
              <button
                type="button"
                className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-xs text-brand-700"
                onClick={() =>
                  setQuantity(line.product.id, Math.round((line.quantity + TOP_UP_KG) * 100) / 100)
                }
              >
                {t('checkout.topUp')}
              </button>
            ) : null}
            <span className="shrink-0">{t.money(lineTotal(line))}</span>
          </li>
        ))}
      </ul>
      {(() => {
        const forgot = forgottenProducts(
          pastOrders,
          store.id,
          new Set(group?.lines.map((line) => line.product.id) ?? []),
          products,
        );
        if (forgot.length === 0) return null;
        return (
          <div className="mt-3">
            <p className="text-xs text-ink-muted">
              {t('checkout.forgot')} · {t('checkout.forgotHint')}
            </p>
            <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {forgot.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="go-chip h-9 shrink-0"
                  onClick={() =>
                    setQuantity(product.id, product.minQuantity || product.quantityStep || 1)
                  }
                >
                  + {tr(product.name, locale)}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
      {!group || group.lines.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          {t('checkout.emptyStore')}{' '}
          <Link href={`/${locale}/stores/${store.id}`} className="underline">
            {t('checkout.addItems')}
          </Link>
        </p>
      ) : null}

      {plusActive(user) ? (
        <p className="mt-3 text-xs font-medium text-brand-700">✓ {t('checkout.plusDelivery')}</p>
      ) : quote ? (
        <FreeDeliveryBar
          subtotal={quote.totals.subtotal.amount}
          threshold={quote.freeDeliveryThreshold}
          locale={locale}
          className="mt-3 bg-sand-50"
        />
      ) : null}

      <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between text-ink-muted">
          <dt>
            {group
              ? t.n(
                  'cart.items',
                  group.lines.length + followers.reduce((n, f) => n + f.group.lines.length, 0),
                )
              : t('cart.goods')}
          </dt>
          <dd>{t.money(totals?.subtotal.amount ?? group?.subtotal.amount ?? 0)}</dd>
        </div>
        <div className="flex justify-between text-ink-muted">
          <dt>
            {t('cart.delivery')}
            {quote ? ` · ${t('common.km', { km: (quote.distanceMeters / 1000).toFixed(1) })}` : ''}
          </dt>
          <dd>{totals ? t.money(totals.deliveryFee.amount) : '—'}</dd>
        </div>
        {totals && totals.serviceFee.amount > 0 ? (
          <div className="flex justify-between text-ink-muted">
            <dt>{t('checkout.serviceFee')}</dt>
            <dd>{t.money(totals.serviceFee.amount)}</dd>
          </div>
        ) : null}
        {totals && totals.discount.amount > 0 ? (
          <div className="flex justify-between text-brand-700">
            <dt>{t('checkout.discount')}</dt>
            <dd>−{t.money(totals.discount.amount)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between font-display text-base font-extrabold tabular-nums">
          <dt>{t('cart.total')}</dt>
          <dd>{totals ? t.money(totals.total.amount) : '—'}</dd>
        </div>
      </dl>
      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-saffron-100 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      <p className="mt-3 pb-2 text-xs text-ink-muted">
        {t('checkout.weighNote')}{' '}
        <Link href={`/${locale}/rules`} className="underline">
          {t('checkout.rulesLink')}
        </Link>
      </p>
    </GoShell>
  );
}
