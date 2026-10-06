/**
 * The bazaar pieces the web screens share: a product as a photo card with the
 * cardboard sign hanging off a corner on its pin (the vendor's line on it, «+»
 * into the basket), and the bottom bar that turns into «Оформить».
 */
'use client';

import type { T } from '@bazar/i18n';
import {
  arrivedToday,
  discountPercent,
  photo,
  productLineTotal,
  tierTexts,
  tr,
  unitLabel,
} from '@bazar/storefront';
import type { ProductDto, StoreDto } from '@bazar/types';
import Link from 'next/link';
import { useState } from 'react';

import { Bag, Check, Heart, Mic, ShareGlyph } from '@/components/go/icons';
import { useCartActions, useCartQuantities } from '@/features/cart';
import { useFavorite, type FavoriteKind } from '@/features/favorites';

import s from './bazar.module.css';

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
  const min = product.minQuantity || step;
  // The sign swings on its pin when the product goes into the basket — not when a page opens
  // on a basket that already holds it.
  const [swing, setSwing] = useState(false);
  const add = () => {
    if (qty === 0) setSwing(true);
    setQuantity(product.id, qty === 0 ? min : qty + step);
  };
  const remove = () => setQuantity(product.id, qty - step < min ? 0 : qty - step);
  const off = discountPercent(product);
  // Saved, but not on the counter today: the photo fades, the sign says so, no «+».
  const soldOut = !product.available;
  // Wholesale and «3 за …» steps: the web has no product page, so the sign says them.
  const steps = soldOut ? [] : tierTexts(t, locale, product);
  const note = [
    soldOut ? t('fav.soldOut') : null,
    stall ? (stall.ownerName ?? tr(stall.name, locale)) : null,
    !soldOut && arrivedToday(product) ? t('store.arrivedToday') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={s.card}>
      <Link
        href={href}
        className={`${s.cardPhoto} ${image ? 'photo-grade' : ''} ${soldOut ? s.cardDim : ''}`}
        style={image ? { backgroundImage: `url(${photo(image, 960)})` } : undefined}
        aria-label={tr(product.name, locale)}
      />
      <HeartButton kind="product" id={product.id} locale={locale} t={t} className={s.heartCard} />
      {off > 0 ? <span className={s.saleBadge}>−{off} %</span> : null}
      <div
        className={`${s.sign} ${index % 2 ? s.signRight : ''} ${qty > 0 ? `${s.signChosen} ${s.signStepping}` : ''} ${swing ? s.signSwing : ''}`}
        style={{ transform: `rotate(${[-1.2, 1, 0.6, -0.8][index % 4]}deg)` }}
        onAnimationEnd={() => setSwing(false)}
      >
        <span className={s.pin} aria-hidden />
        <div className={s.signTitle}>{tr(product.name, locale)}</div>
        <div className={s.signPrice}>
          {/* Price and unit are one piece: «18 000 сум /» never ends a line with «кг» under it. */}
          <span className={s.signNow}>
            {t.money(product.price.amount)}
            {'\u00a0'}
            <small>
              /{'\u00a0'}
              {units[product.unit]}
            </small>
          </span>
          {off > 0 && product.oldPrice ? (
            <del className={s.signOld}>{t.money(product.oldPrice.amount)}</del>
          ) : null}
        </div>
        {product.description ? (
          <div className={s.signSay}>«{tr(product.description, locale)}»</div>
        ) : null}
        {steps.map((step) => (
          <div key={step} className={s.signTier}>
            {step}
          </div>
        ))}
        {note ? <div className={s.signNote}>{note}</div> : null}
        {soldOut ? null : qty > 0 ? (
          // «− N +»: a step back where it was added, hanging off the same corner.
          <span className={s.signStepper}>
            <button
              type="button"
              onClick={remove}
              className={s.signStep}
              aria-label={t('common.less')}
            >
              −
            </button>
            <span className={s.signStepCount}>
              {t.qty(qty)} {units[product.unit]}
            </span>
            <button
              type="button"
              onClick={add}
              className={`${s.signStep} ${s.signStepMore}`}
              aria-label={t('common.more')}
            >
              +
            </button>
          </span>
        ) : (
          <button type="button" onClick={add} className={s.plus} aria-label={t('common.add')}>
            +
          </button>
        )}
      </div>
    </div>
  );
}

/** The heart: saves a good or a stall to «Избранное»; a guest is asked to sign in first. */
export function HeartButton({
  kind,
  id,
  locale,
  t,
  className,
}: {
  kind: FavoriteKind;
  id: string;
  locale: string;
  t: T;
  /** The disc it sits in: the round header button, or the corner of a photo card. */
  className: string | undefined;
}) {
  const { saved, toggle } = useFavorite(kind, id, locale);
  return (
    <button
      type="button"
      onClick={toggle}
      className={`${className ?? ''} ${s.heart}`}
      aria-pressed={saved}
      aria-label={t(saved ? 'fav.forget' : 'fav.save')}
    >
      <Heart size={20} filled={saved} />
    </button>
  );
}

/**
 * «Поделиться»: the system sheet where there is one (phones), else the link to the clipboard and a
 * tick for a moment. A dismissed sheet is not an error.
 */
export function ShareButton({ text, path, t }: { text: string; path: string; t: T }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Dismissed, or the clipboard was refused: nothing to report.
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      className={`${s.round} ${s.shareButton}`}
      aria-label={copied ? t('cart.linkCopied') : t('common.share')}
      title={copied ? t('cart.linkCopied') : t('common.share')}
    >
      {copied ? <Check /> : <ShareGlyph />}
    </button>
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
  // As the order will charge it: a quantity price counts.
  const total = inCart.reduce((sum, p) => sum + productLineTotal(p, quantities[p.id] ?? 0), 0);
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
              <span style={{ color: 'var(--ochre)' }}>
                <Mic />
              </span>
              <span style={{ minWidth: 0 }}>
                <div className={s.glassTitle}>{t(evening ? 'scene.sayEvening' : 'scene.say')}</div>
                <div className={s.glassHint}>{t('scene.sayHint')}</div>
              </span>
            </Link>
            <Link href={`${home}/cart`} className={s.disc} aria-label={t('cart.title')}>
              <Bag />
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
