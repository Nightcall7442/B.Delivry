/**
 * Product tile the way a marketplace does it: a grey tile, the photo in a
 * frame, rating with reviews, price with the bonus that comes back, one
 * button that turns into a stepper.
 */
'use client';

import type { ProductDto } from '@bazar/types';
import { arrivedToday, cashbackFor, tagLabel, tr, unitLabel } from '@bazar/storefront';
import { createT } from '@bazar/i18n';

import { Coin, Leaf, Star } from '@/components/go/icons';
import { Photo } from '@/components/go/photo';
import { useCartItem } from '@/features/cart';

export function ProductTile({ product, locale }: { product: ProductDto; locale: string }) {
  const t = createT(locale);
  const step = product.quantityStep || 1;
  const { quantity, add, remove } = useCartItem(product.id, step, product.minQuantity || step);
  const unit = unitLabel(locale)[product.unit];
  const soldOut = !product.available;
  const bonus = cashbackFor(product.price.amount);

  return (
    <article
      className={`tile group flex h-full flex-col p-2 transition-transform hover:-translate-y-0.5 ${soldOut ? 'opacity-50' : ''}`}
    >
      <div className="relative">
        <Photo
          src={product.images[0]?.url}
          alt={tr(product.name, locale)}
          sizes="(min-width: 768px) 220px, 45vw"
          className="aspect-square rounded-2xl"
          fallback={<Leaf size={40} />}
        />
        {product.oldPrice ? (
          <span className="absolute left-2 top-2 rounded-lg bg-danger px-1.5 py-0.5 text-[11px] font-bold text-white">
            −{Math.round((1 - product.price.amount / product.oldPrice.amount) * 100)}%
          </span>
        ) : arrivedToday(product) ? (
          <span className="absolute left-2 top-2 rounded-lg bg-brand-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {t('store.todayBadge')}
          </span>
        ) : product.tags[0] ? (
          <span className="absolute left-2 top-2 rounded-lg bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-brand-deep">
            {tagLabel(locale)[product.tags[0]]}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-1 pt-2">
        <p className="line-clamp-2 text-sm font-medium leading-5">{tr(product.name, locale)}</p>
        {product.reviewCount > 0 ? (
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
            <span className="text-saffron-500">
              <Star size={11} />
            </span>
            <span className="font-semibold text-ink">{product.rating.toFixed(1)}</span>·{' '}
            {t('tile.reviews', { count: product.reviewCount })}
          </p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="whitespace-nowrap font-display text-base font-extrabold tabular-nums">
            {t.money(product.price.amount)}
          </span>
          {product.oldPrice ? (
            <span className="whitespace-nowrap text-xs text-ink-faint line-through">
              {t.money(product.oldPrice.amount)}
            </span>
          ) : null}
        </p>
        {bonus > 0 ? (
          <p className="flex items-center gap-0.5 text-xs font-bold text-brand-700">
            +{t.qty(bonus / 100)}
            <Coin size={12} />
          </p>
        ) : null}
        <p className="text-[11px] text-ink-muted">
          {product.stock !== null && product.stock <= 10
            ? t('store.left', { count: product.stock ?? 0 })
            : `1 ${unit}`}
        </p>

        <div className="mt-auto pt-2">
          {soldOut ? (
            <span className="flex h-9 items-center justify-center rounded-xl bg-surface-raise text-sm text-ink-muted">
              {t('store.outOfStock')}
            </span>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={add}
              className="flex h-9 w-full items-center justify-center rounded-xl bg-surface-raise text-sm font-bold text-brand-700 transition-colors hover:bg-brand-50"
            >
              {t('product.addToCart')}
            </button>
          ) : (
            <div className="flex h-9 items-center justify-between rounded-xl bg-surface-raise text-brand-700">
              <button
                type="button"
                onClick={remove}
                className="h-full w-10 text-lg font-bold"
                aria-label={t('common.remove')}
              >
                −
              </button>
              <span className="text-sm font-bold">
                {t.qty(quantity)} {unit}
              </span>
              <button
                type="button"
                onClick={add}
                className="h-full w-10 text-lg font-bold"
                aria-label={t('common.add')}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
