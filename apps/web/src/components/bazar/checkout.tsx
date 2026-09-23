/**
 * Checkout as two slips to fill in: where, who opens the door, when, how to
 * pay — then the receipt with the API's total, and a single «Заказать» in the
 * bottom bar. The logic is the old screen's; only the paper is new.
 */
'use client';

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
  freeDeliveryProgress,
  haggleFor,
  type MapStoreDto,
  orderReasonText,
  paymentMethodText,
  photo,
  plusActive,
  substitutionText,
  TOP_UP_KG,
  tr,
  unitLabel,
} from '@bazar/storefront';
import type { HaggleDto, OrderQuoteDto, ProductDto } from '@bazar/types';
import { createT } from '@bazar/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { ArrowLeft, Banknote, Card, Check, HomeGlyph, Smartphone } from '@/components/go/icons';
import { useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { groupByStore, useCartActions, useCartQuantities } from '@/features/cart';
import { useOrderList } from '@/features/orders';
import { api } from '@/lib/api';

import s from './bazar.module.css';

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

export function BazaarCheckout({
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
  // A shop swaps a missing item for the same thing; at a stall the seller calls first.
  const [policy, setPolicy] = useState<SubstitutionPolicy>(defaultSubstitution(store));
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
  }, [user, address, items, store.id, followers.length, groupStores, locale]);

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

  const ground = store.counterPhotoUrl ?? store.coverUrl ?? null;
  const lines = group?.lines ?? [];
  const count = lines.length + followers.reduce((n, f) => n + f.group.lines.length, 0);
  const forgot = forgottenProducts(
    pastOrders,
    store.id,
    new Set(lines.map((line) => line.product.id)),
    products,
  );
  const free = quote
    ? freeDeliveryProgress(quote.totals.subtotal.amount, quote.freeDeliveryThreshold)
    : null;
  const chip = (on: boolean) => `${s.chipPaper} ${on ? s.chipPaperOn : ''}`;

  return (
    <main className={s.scene}>
      {ground ? (
        <div
          className={`${s.photo} ${s.photoDim}`}
          style={{ backgroundImage: `url(${photo(ground, 1280)})` }}
        />
      ) : null}
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={`/${locale}/cart`} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{tr(store.name, locale)}</span>
        </div>
        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 26px' }}>
          <h1 className={s.display} style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>
            {t('checkout.title')}
          </h1>
          {followers.length > 0 ? (
            <p
              className={s.hand}
              style={{ fontSize: 24, margin: '6px 0 0', color: 'var(--cream-muted)' }}
            >
              {t('checkout.oneTrip', {
                stores: [store, ...followers.map((f) => f.store)]
                  .map((row) => tr(row.name, locale))
                  .join(' + '),
              })}
            </p>
          ) : null}
        </div>

        <section className={s.receipt}>
          <div className={s.rcHead}>
            <span className={s.rcTitle}>{t('receipt.address')}</span>
          </div>
          <Link href={`/${locale}/address?next=${encodeURIComponent(here)}`} className={s.rcVendor}>
            <span
              className={`${s.avatar} ${s.avatarSmall}`}
              style={{ background: 'var(--kraft)', color: 'var(--pomegranate)' }}
            >
              <HomeGlyph />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className={s.rcVendorMeta}>{t('checkout.where')}</span>
              <span className={s.rcVendorName} style={{ fontSize: 19 }}>
                {address ? addressLabel(address.text) : t('home.setAddress')}
              </span>
            </span>
            <span className={s.checkoutArrow} style={{ color: 'var(--pomegranate)' }}>
              →
            </span>
          </Link>
          {quote && !quote.deliverable ? (
            <p role="alert" className={`${s.rcHint} ${s.rcWarn}`}>
              {orderReasonText(quote.reason, locale) ?? quote.reason ?? t('checkout.undeliverable')}
              {quote.reason?.includes('minimum')
                ? t('checkout.minimum', { amount: t.money(quote.minOrder.amount) })
                : ''}
            </p>
          ) : null}
          <div className={s.fields}>
            <input
              value={apartment}
              onChange={(e) => setApartment(e.target.value)}
              className={s.field}
              placeholder={t('checkout.apartment')}
              inputMode="numeric"
            />
            <input
              value={entrance}
              onChange={(e) => setEntrance(e.target.value)}
              className={s.field}
              placeholder={t('checkout.entrance')}
            />
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className={s.field}
            placeholder={t('checkout.courierComment')}
          />

          <label className={s.rcToggle}>
            <input
              type="checkbox"
              checked={forSomeone}
              onChange={(e) => setForSomeone(e.target.checked)}
            />
            <span>{t('checkout.forSomeone')}</span>
          </label>
          {forSomeone ? (
            <>
              <p className={s.rcHint}>{t('checkout.forSomeoneHint')}</p>
              <div className={s.fields}>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className={s.field}
                  placeholder={t('checkout.recipientName')}
                  autoComplete="name"
                />
                <input
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className={s.field}
                  placeholder={t('checkout.recipientPhone')}
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
            </>
          ) : null}

          <div className={s.rcSection}>{t('checkout.when')}</div>
          <div className={s.chips}>
            <button type="button" className={chip(slot === null)} onClick={() => setSlot(null)}>
              {t('checkout.asap')}
              {quote?.deliverable ? ` · ${t('common.eta', { minutes: quote.etaMinutes })}` : ''}
            </button>
            {slots.map((option) => (
              <button
                key={option.id}
                type="button"
                className={chip(slot === option.startsAt)}
                onClick={() => setSlot(option.startsAt)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {slot ? <p className={s.rcHint}>{t('checkout.slotHint')}</p> : null}

          <div className={s.rcSection}>{t('checkout.vendor')}</div>
          <textarea
            value={vendorComment}
            onChange={(e) => setVendorComment(e.target.value)}
            rows={2}
            className={s.field}
            placeholder={t('checkout.vendorComment')}
          />
          <p className={s.rcHint}>{t('checkout.ifMissing')}</p>
          <div className={s.chips}>
            {SUBSTITUTION_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={chip(policy === option)}
                title={substitution[option].hint}
                onClick={() => setPolicy(option)}
              >
                {substitution[option].title}
              </button>
            ))}
          </div>
          <p className={s.rcHint}>{substitution[policy].hint}</p>

          <div className={s.rcSection}>{t('checkout.payment')}</div>
          <ul className={s.rcLines}>
            {[
              ...METHODS,
              ...(balance > 0 ? [{ method: PAYMENT_METHOD.BALANCE, icon: <Card /> }] : []),
              ...(business?.approved
                ? [{ method: PAYMENT_METHOD.INVOICE, icon: <Banknote /> }]
                : []),
            ].map(({ method, icon }) => {
              const text = paymentMethodText(locale)[method];
              const active = payment === method;
              return (
                <li key={method}>
                  <button
                    type="button"
                    className={s.payRow}
                    onClick={() => setPayment(method)}
                    aria-pressed={active}
                  >
                    <span className={s.payIcon} aria-hidden>
                      {icon}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className={s.rcName} style={{ fontSize: 17 }}>
                        {method === PAYMENT_METHOD.BALANCE
                          ? t('payment.BALANCE.withAmount', { amount: t.money(balance) })
                          : text.title}
                      </span>
                      <span className={s.rcUnit}>{text.hint}</span>
                    </span>
                    <span className={`${s.tick} ${active ? s.tickOn : ''}`}>
                      {active ? <Check /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {payment === PAYMENT_METHOD.ONLINE ? (
            <p className={s.rcHint}>{t('checkout.onlineHint')}</p>
          ) : null}
        </section>

        <section className={s.receipt}>
          <div className={s.rcHead}>
            <span className={s.rcTitle}>{t('receipt.title')}</span>
            <span className={s.rcDate}>{count > 0 ? t.n('cart.items', count) : ''}</span>
          </div>
          {[{ store, group }, ...followers].map((part) =>
            part.group ? (
              <div key={part.store.id}>
                <div className={s.rcSection}>
                  {part.store.ownerName ?? tr(part.store.name, locale)}
                </div>
                <ul className={s.rcLines}>
                  {part.group.lines.map((line) => (
                    <li
                      key={line.product.id}
                      className={s.rcLine}
                      style={{ alignItems: 'center', padding: '10px 0' }}
                    >
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className={s.rcName} style={{ fontSize: 17 }}>
                          {tr(line.product.name, locale)}
                        </span>
                        <span className={s.rcUnit}>
                          {t.qty(line.quantity)} {unitLabel(locale)[line.product.unit]}
                          {line.product.unit === 'KG' && part.store.id === store.id ? (
                            <>
                              {' · '}
                              <button
                                type="button"
                                className={s.rcLink}
                                onClick={() =>
                                  setQuantity(
                                    line.product.id,
                                    Math.round((line.quantity + TOP_UP_KG) * 100) / 100,
                                  )
                                }
                              >
                                {t('checkout.topUp')}
                              </button>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <span className={s.rcSum} style={{ fontSize: 22, paddingTop: 0 }}>
                        {t.money(lineTotal(line))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {forgot.length > 0 ? (
            <>
              <p className={s.rcHint}>
                {t('checkout.forgot')} · {t('checkout.forgotHint')}
              </p>
              <div className={s.chips}>
                {forgot.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={s.chipPaper}
                    onClick={() =>
                      setQuantity(product.id, product.minQuantity || product.quantityStep || 1)
                    }
                  >
                    + {tr(product.name, locale)}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {lines.length === 0 ? (
            <p className={s.rcHint}>
              {t('checkout.emptyStore')}{' '}
              <Link href={`/${locale}/stores/${store.id}`} className={s.rcLink}>
                {t('checkout.addItems')}
              </Link>
            </p>
          ) : null}

          <dl className={s.rcTotals}>
            <div className={s.rcRow}>
              <dt>{t('cart.goods')}</dt>
              <dd>{t.money(totals?.subtotal.amount ?? group?.subtotal.amount ?? 0)}</dd>
            </div>
            <div className={s.rcRow}>
              <dt>
                {t('cart.delivery')}
                {quote
                  ? ` · ${t('common.km', { km: (quote.distanceMeters / 1000).toFixed(1) })}`
                  : ''}
              </dt>
              <dd>{totals ? t.money(totals.deliveryFee.amount) : '—'}</dd>
            </div>
            {totals && totals.serviceFee.amount > 0 ? (
              <div className={s.rcRow}>
                <dt>{t('checkout.serviceFee')}</dt>
                <dd>{t.money(totals.serviceFee.amount)}</dd>
              </div>
            ) : null}
            {quote?.heavy ? (
              <p className={s.rcHint}>
                {t('shop.heavy', { sum: t.money(quote.heavySurcharge.amount) })}
              </p>
            ) : null}
            {totals && totals.discount.amount > 0 ? (
              <div className={`${s.rcRow} ${s.rcWarn}`}>
                <dt>{t('checkout.discount')}</dt>
                <dd>−{t.money(totals.discount.amount)}</dd>
              </div>
            ) : null}
            <div className={`${s.rcRow} ${s.rcRowStrong}`}>
              <dt>{t('cart.total')}</dt>
              <dd>{totals ? t.money(totals.total.amount) : '—'}</dd>
            </div>
          </dl>
          {plusActive(user) ? (
            <p className={s.rcHaggle}>✓ {t('checkout.plusDelivery')}</p>
          ) : free ? (
            <p className={free.reached ? s.rcHaggle : s.rcHint}>
              {free.reached
                ? `✓ ${t('cart.freeReached')}`
                : t('cart.freeMore', { amount: t.money(free.remaining) })}
            </p>
          ) : null}
          {lines.some((line) => line.product.unit === 'KG') ? (
            <span className={s.stamp}>{t('receipt.weighed')}</span>
          ) : null}
          {error ? (
            <p role="alert" className={`${s.rcHint} ${s.rcWarn}`}>
              {error}
            </p>
          ) : null}
          <p className={s.rcHint}>
            {t('checkout.weighNote')}{' '}
            <Link href={`/${locale}/rules`} className={s.rcLink}>
              {t('checkout.rulesLink')}
            </Link>
          </p>
        </section>
      </div>

      <div className={s.bar}>
        <div className={s.barInner}>
          <button
            type="button"
            className={s.checkout}
            disabled={!ready}
            onClick={submit}
            style={{ opacity: ready ? 1 : 0.6 }}
          >
            <span style={{ flex: 1, textAlign: 'left' }}>
              <div className={s.checkoutTitle}>
                {!address
                  ? t('checkout.needAddress')
                  : submitting
                    ? t('checkout.placing')
                    : quoting
                      ? t('checkout.calculating')
                      : t('checkout.order')}
              </div>
              {totals ? <div className={s.checkoutSub}>{t.money(totals.total.amount)}</div> : null}
            </span>
            <span className={s.checkoutArrow}>→</span>
          </button>
        </div>
      </div>
    </main>
  );
}
