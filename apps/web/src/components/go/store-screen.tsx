/**
 * A stall or shop: the sheet opens almost full over the map with the stall
 * pinned, category chips filter the tiles, the cart bar sits under the list.
 */
'use client';

import Link from 'next/link';
import type { CategoryDto, ProductDto } from '@bazar/types';
import { createT } from '@bazar/i18n';
import {
  arrivedToday,
  estimateDelivery,
  storeTypeLabel,
  tr,
  type MapStoreDto,
} from '@bazar/storefront';
import { useMemo, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { Basket } from '@/components/go/icons';
import { Photo } from '@/components/go/photo';
import { StoryViewer } from '@/components/go/stories';
import { ProductTile } from '@/components/go/product-tile';
import { useAddress } from '@/features/address';
import { useCartQuantities } from '@/features/cart';

export function StoreScreen({
  store,
  products,
  categories,
  locale,
}: {
  store: MapStoreDto;
  products: readonly ProductDto[];
  categories: readonly CategoryDto[];
  locale: string;
}) {
  const [story, setStory] = useState(false);
  const t = createT(locale);
  const { address } = useAddress();
  const quantities = useCartQuantities();
  const [category, setCategory] = useState<string | null>(null);

  const present = useMemo(() => {
    const ids = new Set(products.map((p) => p.categoryId));
    return categories.filter((c) => ids.has(c.id));
  }, [products, categories]);
  const shown = category ? products.filter((p) => p.categoryId === category) : products;
  const fresh = products.filter((p) => arrivedToday(p) && p.available);

  const inCart = products.filter((p) => quantities[p.id]);
  const total = inCart.reduce((sum, p) => sum + p.price.amount * (quantities[p.id] ?? 0), 0);
  const estimate = address
    ? estimateDelivery(store.point, address.point, store.preparationMinutes)
    : null;

  const meta = [
    storeTypeLabel(locale)[store.type],
    `★ ${store.rating.toFixed(1)}`,
    estimate
      ? t('common.eta', { minutes: estimate.etaMinutes })
      : t('store.prep', { minutes: store.preparationMinutes }),
    estimate ? t('store.delivery', { fee: t.money(estimate.fee.amount) }) : null,
  ].filter(Boolean);

  return (
    <GoShell
      locale={locale}
      back={`/${locale}`}
      header={
        <>
          {(store.counterPhotoUrl ?? store.coverUrl) ? (
            <button
              type="button"
              onClick={() => setStory(true)}
              className="group relative block h-48 w-full overflow-hidden rounded-3xl bg-surface-soft text-left md:h-72"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={store.counterPhotoUrl ?? store.coverUrl ?? ''}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              {store.counterPhotoUrl ? (
                <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-bold text-white">
                  {t('store.counterNow')} ·{' '}
                  {t('store.counterAt', {
                    time: store.counterPhotoAt
                      ? new Date(store.counterPhotoAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '',
                  })}
                </span>
              ) : null}
            </button>
          ) : null}
          {story ? (
            <StoryViewer
              stores={[store]}
              start={0}
              locale={locale}
              cta={false}
              onClose={() => setStory(false)}
            />
          ) : null}
          <div className="tile mt-3 flex items-center gap-3 p-4">
            <Photo
              src={store.logoUrl ?? store.coverUrl}
              alt=""
              sizes="56px"
              className="h-14 w-14 shrink-0 rounded-2xl"
              fallback={<Basket />}
            />
            <div className="min-w-0">
              <h1 className="line-clamp-2 font-display text-xl font-extrabold leading-6 [text-wrap:balance] md:text-2xl">
                {tr(store.name, locale)}
              </h1>
              <p className="truncate text-sm text-ink-muted">{meta.join(' · ')}</p>
            </div>
          </div>
          {!store.isOpen ? (
            <p className="mt-3 rounded-2xl bg-saffron-100 px-3 py-2 text-sm">
              {t('store.closedHint')}
            </p>
          ) : null}
          {store.ownerName ? (
            <div className="tile mt-3 p-4">
              <div className="flex items-center gap-3">
                <Photo
                  src={store.ownerPhotoUrl}
                  alt=""
                  sizes="56px"
                  className="h-14 w-14 shrink-0 rounded-full"
                  fallback={
                    <span className="font-display text-lg font-extrabold text-brand-700">
                      {store.ownerName.slice(0, 1)}
                    </span>
                  }
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand-700">
                    {t('store.owner')}
                  </p>
                  <p className="font-display text-base font-bold">{store.ownerName}</p>
                  {store.ownerSince ? (
                    <p className="text-xs text-ink-muted">
                      {t('store.ownerSince', { year: store.ownerSince })}
                    </p>
                  ) : null}
                </div>
              </div>
              {store.ownerMotto ? (
                <p className="mt-3 text-[15px] leading-6">«{tr(store.ownerMotto, locale)}»</p>
              ) : null}
            </div>
          ) : null}

          {fresh.length > 0 && category === null ? (
            <section className="mt-3">
              <h2 className="font-display text-base font-bold">{t('store.arrivedToday')}</h2>
              <div className="-mx-4 mt-2 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {fresh.map((product) => (
                  <div key={product.id} className="w-40 shrink-0 md:w-48">
                    <ProductTile product={product} locale={locale} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {present.length > 1 ? (
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                className="go-chip"
                aria-pressed={category === null}
                onClick={() => setCategory(null)}
              >
                {t('common.all')}
              </button>
              {present.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="go-chip"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {tr(c.name, locale)}
                </button>
              ))}
            </div>
          ) : null}
        </>
      }
      footer={
        inCart.length > 0 ? (
          <Link href={`/${locale}/cart`} className="btn-go justify-between px-5">
            <span>{t.n('cart.items', inCart.length)}</span>
            <span>{t.money(total)}</span>
          </Link>
        ) : undefined
      }
    >
      {store.description ? (
        <p className="mt-2 text-sm text-ink-muted">{tr(store.description, locale)}</p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {shown.map((product) => (
          <ProductTile key={product.id} product={product} locale={locale} />
        ))}
      </div>
    </GoShell>
  );
}
