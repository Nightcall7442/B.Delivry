/**
 * The bazaar pieces the web screens share: a product as a photo card with the
 * cardboard sign hanging off a corner (the vendor's line on it, «+» into the
 * basket), the bottom bar that turns into «Оформить», and the clock.
 */
'use client';

import type { T } from '@bazar/i18n';
import { arrivedToday, photo, tr, unitLabel } from '@bazar/storefront';
import type { ProductDto, StoreDto } from '@bazar/types';
import Link from 'next/link';

import { Bag, Mic } from '@/components/go/icons';
import { useCartActions, useCartQuantities } from '@/features/cart';

import s from './bazar.module.css';

/** Tashkent hour: the bazaar lives on its own clock, not the visitor's. */
export const tashkentHour = (now = new Date()) => (now.getUTCHours() + 5) % 24;
export const isEvening = (hour = tashkentHour()) => hour >= 17 || hour < 5;

export function ProductCard({
  product,
  stall,
  locale,
  t,
  index,
  href,
}: {
  product: ProductDto;
  stall?: StoreDto | undefined;
  locale: string;
  t: T;
  index: number;
  href: string;
}) {
  const units = unitLabel(locale);
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const qty = quantities[product.id] ?? 0;
  const image = product.images[0]?.url ?? null;
  const step = product.quantityStep || 1;
  const add = () => setQuantity(product.id, qty === 0 ? product.minQuantity || step : qty + step);
  const note = [
    stall ? (stall.ownerName ?? tr(stall.name, locale)) : null,
    arrivedToday(product) ? t('store.arrivedToday') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={s.card}>
      <Link
        href={href}
        className={s.cardPhoto}
        style={image ? { backgroundImage: `url(${photo(image, 960)})` } : undefined}
        aria-label={tr(product.name, locale)}
      />
      <div
        className={`${s.sign} ${index % 2 ? s.signRight : ''} ${qty > 0 ? s.signChosen : ''}`}
        style={{ transform: `rotate(${[-1.2, 1, 0.6, -0.8][index % 4]}deg)` }}
      >
        <div className={s.signTitle}>{tr(product.name, locale)}</div>
        <div className={s.signPrice}>
          {t.money(product.price.amount)} <small>/ {units[product.unit]}</small>
        </div>
        {product.description ? (
          <div className={s.signSay}>«{tr(product.description, locale)}»</div>
        ) : null}
        {note ? <div className={s.signNote}>{note}</div> : null}
        <button
          type="button"
          onClick={add}
          className={`${s.plus} ${qty > 0 ? s.plusChosen : ''}`}
          aria-label={t('common.add')}
        >
          {qty > 0 ? t('scene.inCart', { count: `${t.qty(qty)} ${units[product.unit]}` }) : '+'}
        </button>
      </div>
    </div>
  );
}

/** The bottom bar: the voice line and the basket disc, or «Оформить · N · сумма» once something is in. */
export function BasketBar({
  products,
  locale,
  t,
  evening,
}: {
  products: readonly ProductDto[];
  locale: string;
  t: T;
  evening: boolean;
}) {
  const quantities = useCartQuantities();
  const home = `/${locale}`;
  const inCart = products.filter((p) => quantities[p.id]);
  const total = inCart.reduce((sum, p) => sum + p.price.amount * (quantities[p.id] ?? 0), 0);
  const stalls = new Set(inCart.map((p) => p.storeId));
  // One stall goes straight to checkout; several — the receipts decide how many trips it is.
  const checkoutHref =
    stalls.size === 1 ? `${home}/checkout?store=${[...stalls][0]}` : `${home}/cart`;
  return (
    <div className={s.bar}>
      <div className={s.barInner}>
        {inCart.length > 0 ? (
          <>
            <Link href={checkoutHref} className={s.checkout}>
              <Bag />
              <span>
                <div className={s.checkoutTitle}>{t('cart.checkout')}</div>
                <div className={s.checkoutSub}>
                  {t.n('cart.items', inCart.length)} · {t.money(total)}
                </div>
              </span>
              <span className={s.checkoutArrow}>→</span>
            </Link>
            <Link
              href={`${home}/list`}
              className={`${s.disc} ${s.discGlass}`}
              aria-label={t('scene.say')}
            >
              <Mic />
            </Link>
          </>
        ) : (
          <>
            <Link href={`${home}/list`} className={s.glass}>
              <span style={{ color: 'var(--saffron)' }}>
                <Mic />
              </span>
              <span style={{ minWidth: 0 }}>
                <div className={s.glassTitle}>{t(evening ? 'scene.sayEvening' : 'scene.say')}</div>
                <div className={s.glassHint}>{t('scene.sayHint')}</div>
              </span>
            </Link>
            <Link
              href={`${home}/cart`}
              className={`${s.disc} ${evening ? s.discEvening : ''}`}
              aria-label={t('cart.title')}
            >
              <Bag />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
