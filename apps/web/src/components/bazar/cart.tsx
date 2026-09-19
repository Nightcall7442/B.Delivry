/**
 * The basket as receipts: one paper slip per stall, because a bazaar order is
 * picked up at one counter — two stalls are two slips, two couriers, two
 * orders. Said on the paper, not discovered at checkout. Weighed goods get a
 * stamp: the sum is settled on the scales.
 */
'use client';

import { isApiError, room } from '@bazar/api-client';
import { CASHBACK } from '@bazar/constants';
import { createT, type T } from '@bazar/i18n';
import {
  decodeShare,
  encodeShare,
  estimateDelivery,
  haggleFor,
  photo,
  oneTrip as oneTripStores,
  tr,
  unitLabel,
  type MapStoreDto,
} from '@bazar/storefront';
import { WS_EVENT, type HaggleDto, type ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ArrowLeft } from '@/components/go/icons';
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

import { isEvening } from './index';
import s from './bazar.module.css';

const WEIGHED = new Set(['KG', 'G']);

export function BazaarCart({
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
  const home = `/${locale}`;
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
    router.replace(`${home}/cart`);
    // Runs once the cart has loaded; later quantity changes must not re-merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, share]);
  const shareCart = async () => {
    const url = `${window.location.origin}${home}/cart?share=${encodeURIComponent(encodeShare(quantities))}`;
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

  // The page priced what it knew; whatever the basket holds beyond that (a shop shelf is
  // bigger than one page) is fetched by id, sold-out lines included.
  const known = useRef(new Map(products.map((p) => [p.id, p])));
  const [extra, setExtra] = useState<ProductDto[]>([]);
  const missing = Object.keys(quantities)
    .filter((id) => !known.current.has(id))
    .sort()
    .join(',');
  useEffect(() => {
    if (!missing) return;
    api()
      .catalog.products({ ids: missing.split(','), availableOnly: false, pageSize: 100 })
      .then((page) => {
        for (const p of page.items) known.current.set(p.id, p);
        setExtra((current) => [...current, ...page.items]);
      })
      .catch(() => undefined);
  }, [missing]);
  const priced = useMemo(() => [...products, ...extra], [products, extra]);
  const groups = useMemo(() => groupByStore(priced, quantities), [priced, quantities]);
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  // Cross-bazaar: stalls of one bazaar → one courier trip on offer; shops always ride alone.
  const oneTrip = useMemo(() => oneTripStores(groups, storeById), [groups, storeById]);

  const evening = isEvening();
  const first = groups[0] ? storeById.get(groups[0].storeId) : null;
  const ground = first?.counterPhotoUrl ?? first?.coverUrl ?? null;
  const today = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tashkent',
  }).format(new Date());

  return (
    <main className={s.scene}>
      <div
        className={`${s.photo} ${s.photoDim} ${evening ? s.photoEvening : ''}`}
        style={{
          backgroundImage: `url(${ground ? photo(ground, 1280) : `/scenes/${evening ? 'evening' : 'morning'}.jpg`})`,
        }}
      />
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <button
            type="button"
            onClick={() => router.back()}
            className={s.round}
            aria-label={t('common.back')}
          >
            <ArrowLeft />
          </button>
          <span className={s.tag}>{t('receipt.title')}</span>
        </div>

        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 26px' }}>
          <div className={s.eyebrow}>{today}</div>
          <h1 className={s.display} style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>
            {t('cart.title')}
          </h1>
          {groups.length > 0 ? (
            <p
              className={s.hand}
              style={{ fontSize: 24, margin: '6px 0 0', color: 'var(--cream-muted)' }}
            >
              {oneTrip
                ? t('receipt.stalls', { count: oneTrip.length })
                : groups.length === 1
                  ? t('receipt.stall')
                  : t('receipt.separate', { count: groups.length })}
            </p>
          ) : null}
        </div>

        {!ready ? null : groups.length === 0 ? (
          <section className={s.receipt}>
            <div className={s.rcHead}>
              <span className={s.rcTitle}>{t('receipt.title')}</span>
              <span className={s.rcDate}>{today}</span>
            </div>
            <p className={s.rcEmpty}>{t('cart.empty')}</p>
            <p className={s.rcHint}>{t('receipt.emptyLine')}</p>
            <Link href={home} className={s.rcCta} style={{ marginTop: 18 }}>
              {t('common.toStores')} →
            </Link>
          </section>
        ) : (
          <>
            {notice ? <p className={s.notice}>{notice}</p> : null}
            {oneTrip ? (
              <Link
                href={`${home}/checkout?store=${oneTrip[0]}&stores=${oneTrip.slice(1).join(',')}`}
                className={s.oneTrip}
              >
                <span>
                  <b>{t('cart.oneTrip')}</b>
                  <small>{t('cart.oneTripHint', { count: oneTrip.length })}</small>
                </span>
                <span className={s.checkoutArrow}>→</span>
              </Link>
            ) : null}

            {groups.map((group, i) => {
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
              const weighed = group.lines.some((l) => WEIGHED.has(l.product.unit));
              const face = store?.ownerPhotoUrl ?? null;

              return (
                <section
                  key={group.storeId}
                  className={s.receipt}
                  style={{ transform: `rotate(${[-0.4, 0.5, -0.3][i % 3]}deg)` }}
                >
                  <div className={s.rcHead}>
                    <span className={s.rcTitle}>{t('receipt.title')}</span>
                    <span className={s.rcDate}>{today}</span>
                  </div>

                  <Link href={`${home}/stores/${group.storeId}`} className={s.rcVendor}>
                    <span
                      className={`${s.avatar} ${s.avatarSmall}`}
                      style={face ? { backgroundImage: `url(${photo(face, 250)})` } : undefined}
                    >
                      {face
                        ? ''
                        : (store
                            ? (store.ownerName ?? tr(store.name, locale))
                            : group.storeId
                          ).slice(0, 1)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className={s.rcVendorName}>
                        {store ? (store.ownerName ?? tr(store.name, locale)) : group.storeId}
                      </span>
                      <span className={s.rcVendorMeta}>
                        {store?.ownerName ? `${tr(store.name, locale)} · ` : ''}
                        {t.n('cart.items', group.lines.length)}
                        {estimate ? ` · ${t('common.eta', { minutes: estimate.etaMinutes })}` : ''}
                      </span>
                    </span>
                  </Link>

                  <ul className={s.rcLines}>
                    {group.lines.map((line) => (
                      <ReceiptLine
                        key={line.product.id}
                        line={line}
                        locale={locale}
                        t={t}
                        haggle={haggleFor(haggles, line.product.id)}
                        onAsk={ask}
                        onChange={(q) => setQuantity(line.product.id, q)}
                      />
                    ))}
                  </ul>
                  {haggleError ? <p className={`${s.rcHint} ${s.rcWarn}`}>{haggleError}</p> : null}
                  {group.unavailable.length > 0 ? (
                    <p className={s.rcHint}>
                      {t('cart.unavailable')}{' '}
                      {group.unavailable.map((l) => tr(l.product.name, locale)).join(', ')}.{' '}
                      <button
                        type="button"
                        className={s.rcLink}
                        onClick={() => clear(group.unavailable.map((l) => l.product.id))}
                      >
                        {t('common.remove')}
                      </button>
                    </p>
                  ) : null}

                  <dl className={s.rcTotals}>
                    <Row label={t('cart.goods')} value={t.money(group.subtotal.amount)} />
                    <Row
                      label={t('cart.delivery')}
                      value={estimate ? t.money(estimate.fee.amount) : t('cart.afterAddress')}
                    />
                    <Row label={t('cart.total')} value={t.money(total)} strong />
                  </dl>
                  <p className={s.rcHint}>{t('receipt.cashback', { percent: CASHBACK.PERCENT })}</p>
                  {weighed ? (
                    <>
                      <span className={s.stamp}>{t('receipt.weighed')}</span>
                      <p className={s.rcHint}>{t('receipt.exact')}</p>
                    </>
                  ) : null}

                  <div className={s.rcActions}>
                    <Link href={`${home}/checkout?store=${group.storeId}`} className={s.rcCta}>
                      {t('cart.checkout')} · {t.money(total)}
                    </Link>
                    <button type="button" className={s.rcLink} onClick={() => clear(ids)}>
                      {t('cart.clear')}
                    </button>
                  </div>
                </section>
              );
            })}

            <button type="button" className={s.share} onClick={() => void shareCart()}>
              <b>{t('cart.share')}</b>
              <small>{t('cart.shareHint')}</small>
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`${s.rcRow} ${strong ? s.rcRowStrong : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ReceiptLine({
  line,
  locale,
  t,
  haggle,
  onChange,
  onAsk,
}: {
  line: CartLine;
  locale: string;
  t: T;
  haggle: HaggleDto | null;
  onChange: (quantity: number) => void;
  onAsk: (productId: string, price: number) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [price, setPrice] = useState('');
  const { product, quantity } = line;
  const step = product.quantityStep || 1;
  const min = product.minQuantity || step;
  const unit = unitLabel(locale)[product.unit];
  const image = product.images[0]?.url ?? null;

  return (
    <li className={s.rcLine}>
      <span
        className={s.thumb}
        style={image ? { backgroundImage: `url(${photo(image, 250)})` } : undefined}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className={s.rcName}>{tr(product.name, locale)}</div>
        <div className={s.rcUnit}>
          {t.money(product.price.amount)} / {unit}
          {product.stock !== null && quantity > product.stock ? (
            <span className={s.rcWarn}> · {t('store.left', { count: product.stock ?? 0 })}</span>
          ) : null}
        </div>
        {haggle?.status === 'ACCEPTED' && haggle.offeredPrice ? (
          <div className={s.rcHaggle}>
            ✓{' '}
            {t('haggle.accepted', {
              price: t.money(haggle.offeredPrice.amount),
              unit,
              time: new Date(haggle.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </div>
        ) : haggle?.status === 'PENDING' ? (
          <div className={s.rcUnit}>
            {t('haggle.pending', { price: t.money(haggle.askedPrice.amount), unit })}
          </div>
        ) : haggle?.status === 'DECLINED' ? (
          <div className={s.rcUnit}>{t('haggle.declined')}</div>
        ) : asking ? (
          <form
            className={s.rcAsk}
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
              className={s.rcField}
              placeholder={t('haggle.placeholder', { unit })}
            />
            <button type="submit" className={s.rcLink}>
              {t('haggle.send')}
            </button>
          </form>
        ) : (
          <button type="button" className={s.rcLink} onClick={() => setAsking(true)}>
            {t('haggle.ask')}
          </button>
        )}
        <div className={s.stepper}>
          <button
            type="button"
            onClick={() => onChange(quantity - step < min ? 0 : quantity - step)}
            aria-label={t('common.remove')}
          >
            −
          </button>
          <span>
            {t.qty(quantity)} {unit}
          </span>
          <button
            type="button"
            onClick={() => onChange(quantity + step)}
            aria-label={t('common.add')}
          >
            +
          </button>
        </div>
      </div>
      <div className={s.rcSum}>{t.money(line.total.amount)}</div>
    </li>
  );
}
