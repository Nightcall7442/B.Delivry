/**
 * A stall as a scene: the morning counter photo fills the window, the person
 * behind it and their line sit on it, then everything on the counter as photo
 * cards with cardboard signs — all of it scrolling over the photo. The basket
 * bar floats at the bottom.
 */
'use client';

import { createT } from '@bazar/i18n';
import { estimateDelivery, isEvening, photo, tr, type MapStoreDto } from '@bazar/storefront';
import type { CategoryDto, ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ArrowLeft, Star } from '@/components/go/icons';
import { useAddress } from '@/features/address';

import { BasketBar, HeartButton, ProductCard, ShareButton } from './index';
import { RegularCard } from './regular-card';
import { SiteFooter } from './site-footer';
import s from './bazar.module.css';

export function BazaarStore({
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
  const t = createT(locale);
  const { address } = useAddress();
  const [category, setCategory] = useState<string | null>(null);
  const evening = isEvening();
  const home = `/${locale}`;

  const present = useMemo(() => {
    const ids = new Set(products.map((p) => p.categoryId));
    return categories.filter((c) => ids.has(c.id));
  }, [products, categories]);
  const shown = (category ? products.filter((p) => p.categoryId === category) : products).filter(
    (p) => p.available,
  );
  const estimate = address
    ? estimateDelivery(store.point, address.point, store.preparationMinutes)
    : null;
  const hero = store.counterPhotoUrl ?? store.coverUrl ?? null;
  const face = store.ownerPhotoUrl ?? null;
  const takenAt = store.counterPhotoAt ? t.time(store.counterPhotoAt) : null;

  return (
    <main className={`hall ${s.scene}`}>
      {/* No counter photo: no scrim either — the hall shows through, lamps and all. */}
      {hero ? (
        <div
          className={`photo-grade ${s.photo} ${s.photoStall}`}
          style={{ backgroundImage: `url(${photo(hero, 1280)})` }}
        />
      ) : null}
      <div className={s.body}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>
            {[
              store.standNumber,
              store.ownerSince ? t('store.ownerSince', { year: store.ownerSince }) : null,
            ]
              .filter(Boolean)
              .join(' · ') || tr(store.name, locale)}
          </span>
          <span className={s.topEnd}>
            <ShareButton
              t={t}
              text={t('share.stall', { name: store.ownerName ?? tr(store.name, locale) })}
              path={`/${locale}/stores/${store.id}`}
            />
            <HeartButton kind="store" id={store.id} locale={locale} t={t} className={s.round} />
          </span>
        </div>

        <div className={`${s.greeting} ${hero ? s.greetingOnPhoto : ''}`}>
          <div className={s.person}>
            {store.ownerName ? (
              <span
                className={`${s.avatar} ${face ? 'photo-grade' : ''}`}
                style={face ? { backgroundImage: `url(${photo(face, 250)})` } : undefined}
              >
                {face ? '' : store.ownerName.slice(0, 1)}
              </span>
            ) : null}
            <div>
              <h1 className={`${s.display} ${s.displayPage}`}>
                {store.ownerName ?? tr(store.name, locale)}
              </h1>
              {store.ownerName ? <div className={s.storeName}>{tr(store.name, locale)}</div> : null}
            </div>
          </div>
          {store.ownerMotto ? (
            <p
              className={`${s.say} ${s.sayMotto}`}
              style={{ maxWidth: '28ch', margin: '10px 0 0' }}
            >
              «{tr(store.ownerMotto, locale)}»
            </p>
          ) : store.description ? (
            <p className={s.say} style={{ maxWidth: '40ch', margin: '10px 0 0' }}>
              {tr(store.description, locale)}
            </p>
          ) : null}
          <div className={s.pills}>
            <span className={s.pill}>
              <Star size={14} /> {store.rating.toFixed(1)}
              {store.reviewCount ? ` · ${store.reviewCount}` : ''}
            </span>
            <span className={s.pill}>
              {estimate
                ? t('common.eta', { minutes: estimate.etaMinutes })
                : t('store.prep', { minutes: store.preparationMinutes })}
            </span>
            {estimate ? (
              <span className={s.pill}>
                {t('store.delivery', { fee: t.money(estimate.fee.amount) })}
              </span>
            ) : null}
            {!store.isOpen ? (
              <span className={`${s.pill} ${s.pillWarn}`}>{t('store.closedHint')}</span>
            ) : null}
          </div>
          {/* «Свой продавец»: shown only to someone who has bought here before. */}
          <RegularCard
            storeId={store.id}
            seller={store.ownerName ?? tr(store.name, locale)}
            locale={locale}
            t={t}
          />
        </div>

        <div className={s.head}>
          <h2 className={s.headTitle}>
            {t('scene.onCounter')}
            {store.counterPhotoUrl && takenAt ? (
              <span className={s.headMeta}> · {t('scene.counterPhotoAt', { time: takenAt })}</span>
            ) : null}
          </h2>
        </div>
        {present.length > 1 ? (
          <div className={s.rail}>
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`${s.chip} ${category === null ? s.chipOn : ''}`}
            >
              {t('common.all')}
            </button>
            {present.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`${s.chip} ${category === c.id ? s.chipOn : ''}`}
              >
                {tr(c.name, locale)}
              </button>
            ))}
          </div>
        ) : null}
        <div className={s.grid}>
          {shown.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              locale={locale}
              t={t}
              index={i}
              href={`${home}/stores/${store.id}`}
            />
          ))}
        </div>
        <SiteFooter locale={locale} />
      </div>
      <BasketBar products={products} locale={locale} t={t} evening={evening} />
    </main>
  );
}
