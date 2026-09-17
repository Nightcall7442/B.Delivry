/**
 * The basket, one block per stall: a bazaar order is picked up at one place,
 * so two stalls are two courier trips and two orders. Said outright, not
 * discovered at checkout.
 */
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ProductDto } from '@bazar/types';
import {
  decodeShare,
  encodeShare,
  sameBazaar,
  estimateDelivery,
  haggleFor,
  tr,
  type MapStoreDto,
  unitLabel,
} from '@bazar/storefront';
import { isApiError, room } from '@bazar/api-client';
import { createT } from '@bazar/i18n';
import { WS_EVENT, type HaggleDto } from '@bazar/types';
import { useEffect, useMemo, useState } from 'react';

import { FreeDeliveryBar } from '@/components/go/free-delivery-bar';
import { GoShell } from '@/components/go/go-shell';
import { Basket, Leaf } from '@/components/go/icons';
import { Photo } from '@/components/go/photo';
import { useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import {
  groupByStore,
  useCartActions,
  useCartQuantities,
  useCartReady,
  type CartLine,
} from '@/features/cart';
import { api } from '@/lib/api';

export function CartScreen({
  products,
  stores,
  locale,
}: {
  products: readonly ProductDto[];
  stores: readonly MapStoreDto[];
  locale: string;
}) {
  const t = createT(locale);
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
  const ready = useCartReady();
  const { setQuantity, clear } = useCartActions();
  const { address } = useAddress();
  // Семейная корзина: a `?share=` link merges the sender's cart into this one, once.
  const share = useSearchParams().get('share');
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !share) return;
    const incoming = decodeShare(share);
    for (const [id, quantity] of Object.entries(incoming)) {
      setQuantity(id, (quantities[id] ?? 0) + quantity);
    }
    setNotice(t('cart.shared'));
    router.replace(`/${locale}/cart`);
    // Runs once the cart has loaded; later quantity changes must not re-merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, share]);
  const shareCart = async () => {
    const url = `${window.location.origin}/${locale}/cart?share=${encodeURIComponent(encodeShare(quantities))}`;
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice(t('cart.linkCopied'));
      }
    } catch {
      // The share sheet was dismissed: nothing to report.
    }
  };

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

  return (
    <GoShell
      locale={locale}
      back="history"
      peek={0.62}
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('cart.title')}</h1>
      }
    >
      {!ready ? null : groups.length === 0 ? (
        <div className="py-12 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sand-100 text-brand-600">
            <Basket size={30} />
          </span>
          <p className="mt-3 text-lg font-medium">{t('cart.empty')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('cart.emptyHint')}</p>
          <Link href={`/${locale}`} className="btn-go mt-6">
            {t('common.toStores')}
          </Link>
        </div>
      ) : (
        <>
          {groups.length > 1 ? (
            <p className="mt-2 text-sm text-ink-muted">{t('cart.multi')}</p>
          ) : null}
          {oneTrip ? (
            <Link
              href={`/${locale}/checkout?store=${oneTrip[0]}&stores=${oneTrip.slice(1).join(',')}`}
              className="btn-go mt-2"
            >
              {t('cart.oneTrip')}
            </Link>
          ) : null}
          {oneTrip ? (
            <p className="mt-1 text-xs text-ink-muted">
              {t('cart.oneTripHint', { count: oneTrip.length })}
            </p>
          ) : null}
          {notice ? <p className="mt-2 text-sm font-medium text-brand-700">{notice}</p> : null}

          {groups.map((group) => {
            const store = storeById.get(group.storeId);
            const ids = [...group.lines, ...group.unavailable].map((l) => l.product.id);
            const estimate =
              store && address
                ? estimateDelivery(
                    store.point,
                    address.point,
                    store.preparationMinutes,
                    group.subtotal.amount,
                  )
                : null;
            const total = group.subtotal.amount + (estimate?.fee.amount ?? 0);

            return (
              <section key={group.storeId} className="mt-4 rounded-2xl bg-sand-50 p-4">
                <header className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/${locale}/stores/${group.storeId}`}
                      className="block truncate text-base font-bold"
                    >
                      {store ? tr(store.name, locale) : group.storeId}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {t.n('cart.items', group.lines.length)}
                      {estimate ? ` · ${t('common.eta', { minutes: estimate.etaMinutes })}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => clear(ids)}
                    className="shrink-0 text-sm text-ink-muted hover:text-danger"
                  >
                    {t('cart.clear')}
                  </button>
                </header>

                <ul className="mt-2 divide-y divide-line">
                  {group.lines.map((line) => (
                    <CartRow
                      key={line.product.id}
                      line={line}
                      locale={locale}
                      haggle={haggleFor(haggles, line.product.id)}
                      onAsk={ask}
                      onChange={(q) => setQuantity(line.product.id, q)}
                    />
                  ))}
                </ul>

                {haggleError ? <p className="mt-1 text-xs text-danger">{haggleError}</p> : null}
                {group.unavailable.length > 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    {t('cart.unavailable')}{' '}
                    {group.unavailable.map((l) => tr(l.product.name, locale)).join(', ')}.{' '}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => clear(group.unavailable.map((l) => l.product.id))}
                    >
                      {t('common.remove')}
                    </button>
                  </p>
                ) : null}

                <FreeDeliveryBar
                  subtotal={group.subtotal.amount}
                  locale={locale}
                  className="mt-3"
                />

                <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  <Row label={t('cart.goods')} value={t.money(group.subtotal.amount)} />
                  <Row
                    label={t('cart.delivery')}
                    value={estimate ? t.money(estimate.fee.amount) : t('cart.afterAddress')}
                  />
                  <Row label={t('cart.total')} value={t.money(total)} strong />
                </dl>

                <Link href={`/${locale}/checkout?store=${group.storeId}`} className="btn-go mt-3">
                  {t('cart.checkout')}
                </Link>
              </section>
            );
          })}
          <button type="button" className="btn-go-secondary mt-4" onClick={() => void shareCart()}>
            {t('cart.share')}
          </button>
          <p className="mt-1 text-xs text-ink-muted">{t('cart.shareHint')}</p>
        </>
      )}
    </GoShell>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between tabular-nums ${strong ? 'font-display text-base font-extrabold' : 'text-ink-muted'}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CartRow({
  line,
  locale,
  haggle,
  onChange,
  onAsk,
}: {
  line: CartLine;
  locale: string;
  haggle: HaggleDto | null;
  onChange: (quantity: number) => void;
  onAsk: (productId: string, price: number) => Promise<void>;
}) {
  const t = createT(locale);
  const [asking, setAsking] = useState(false);
  const [price, setPrice] = useState('');
  const { product, quantity } = line;
  const step = product.quantityStep || 1;
  const min = product.minQuantity || step;
  const unit = unitLabel(locale)[product.unit];

  return (
    <li className="flex items-center gap-3 py-3">
      <Photo
        src={product.images[0]?.url}
        alt=""
        sizes="48px"
        className="h-12 w-12 shrink-0 rounded-xl"
        fallback={<Leaf />}
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-5">{tr(product.name, locale)}</p>
        <p className="font-display text-sm font-extrabold tabular-nums">
          {t.money(line.total.amount)}
        </p>
        <p className="text-xs text-ink-muted">
          {t.money(product.price.amount)} / {unit}
        </p>
        {product.stock !== null && quantity > product.stock ? (
          <p className="text-xs text-danger">{t('store.left', { count: product.stock ?? 0 })}</p>
        ) : null}
        {haggle?.status === 'ACCEPTED' && haggle.offeredPrice ? (
          <p className="text-xs font-medium text-brand-700">
            ✓{' '}
            {t('haggle.accepted', {
              price: t.money(haggle.offeredPrice.amount),
              unit,
              time: new Date(haggle.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        ) : haggle?.status === 'PENDING' ? (
          <p className="text-xs text-ink-muted">
            {t('haggle.pending', { price: t.money(haggle.askedPrice.amount), unit })}
          </p>
        ) : haggle?.status === 'DECLINED' ? (
          <p className="text-xs text-ink-muted">{t('haggle.declined')}</p>
        ) : asking ? (
          <form
            className="mt-1 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const minor = Number(price) * 100;
              if (minor > 0) void onAsk(product.id, minor).then(() => setAsking(false));
            }}
          >
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="go-field h-8 w-28 text-xs"
              placeholder={t('haggle.placeholder', { unit })}
            />
            <button type="submit" className="text-xs font-medium text-brand-700">
              {t('haggle.send')}
            </button>
          </form>
        ) : (
          <button type="button" className="text-xs text-brand-700" onClick={() => setAsking(true)}>
            {t('haggle.ask')}
          </button>
        )}
      </div>
      <div className="flex h-10 shrink-0 items-center rounded-xl bg-surface-raise">
        <button
          type="button"
          onClick={() => onChange(quantity - step < min ? 0 : quantity - step)}
          className="h-full w-10 text-lg"
          aria-label={t('common.remove')}
        >
          −
        </button>
        <span className="min-w-[3.25rem] text-center text-sm font-medium">
          {quantity} {unit}
        </span>
        <button
          type="button"
          onClick={() => onChange(quantity + step)}
          className="h-full w-10 text-lg"
          aria-label={t('common.add')}
        >
          +
        </button>
      </div>
    </li>
  );
}
