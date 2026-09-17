/**
 * A stall as a scene: the morning counter photo fills the window, the person
 * behind it and their line sit on it, then everything on the counter as photo
 * cards with cardboard signs — all of it scrolling over the photo. The basket
 * bar floats at the bottom.
 */
'use client';

import { createT } from '@bazar/i18n';
import { estimateDelivery, photo, tr, type MapStoreDto } from '@bazar/storefront';
import type { CategoryDto, ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ArrowLeft, Star } from '@/components/go/icons';
import { useAddress } from '@/features/address';

import { BasketBar, ProductCard, isEvening } from './index';
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
  const shown = (category ? products.filter((p) => p.categoryId === category) : products).filter((p) => p.available);
  const estimate = address ? estimateDelivery(store.point, address.point, store.preparationMinutes) : null;
  const hero = store.counterPhotoUrl ?? store.coverUrl ?? null;
  const face = store.ownerPhotoUrl ?? null;
  const takenAt = store.counterPhotoAt
    ? new Date(store.counterPhotoAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })
    : null;

  return (
    <main className={s.scene}>
      <div className={s.photo} style={hero ? { backgroundImage: `url(${photo(hero, 1280)})` } : undefined} />
      <div className={s.body}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>
            {[store.standNumber, store.ownerSince ? t('store.ownerSince', { year: store.ownerSince }) : null]
              .filter(Boolean)
              .join(' · ') || tr(store.name, locale)}
          </span>
        </div>

        <div className={s.greeting}>
          <div className={s.person}>
            {store.ownerName ? (
              <span className={s.avatar} style={face ? { backgroundImage: `url(${photo(face, 250)})` } : undefined}>
                {face ? '' : store.ownerName.slice(0, 1)}
              </span>
            ) : null}
            <div>
              <h1 className={s.display} style={{ fontSize: 'clamp(36px, 5.5vw, 64px)' }}>
                {store.ownerName ?? tr(store.name, locale)}
              </h1>
              {store.ownerName ? <div className={s.storeName}>{tr(store.name, locale)}</div> : null}
            </div>
          </div>
          {store.ownerMotto ? (
            <p className={s.hand} style={{ fontSize: 'clamp(24px, 3vw, 34px)', maxWidth: '28ch', margin: '10px 0 0' }}>
              «{tr(store.ownerMotto, locale)}»
            </p>
          ) : store.description ? (
            <p className={s.hand} style={{ fontSize: 22, color: 'var(--cream-muted)', maxWidth: '40ch', margin: '10px 0 0' }}>
              {tr(store.description, locale)}
            </p>
          ) : null}
          <div className={s.pills}>
            <span className={s.pill}>
              <Star size={14} /> {store.rating.toFixed(1)}
              {store.reviewCount ? ` · ${store.reviewCount}` : ''}
            </span>
            <span className={s.pill}>
              {estimate ? t('common.eta', { minutes: estimate.etaMinutes }) : t('store.prep', { minutes: store.preparationMinutes })}
            </span>
            {estimate ? <span className={s.pill}>{t('store.delivery', { fee: t.money(estimate.fee.amount) })}</span> : null}
            {!store.isOpen ? <span className={`${s.pill} ${s.pillWarn}`}>{t('store.closedHint')}</span> : null}
          </div>
        </div>

        <div className={s.head}>
          <h2 className={s.headTitle}>
            {t('scene.onCounter')}
            {store.counterPhotoUrl && takenAt ? <span className={s.headMeta}> · {t('scene.counterPhotoAt', { time: takenAt })}</span> : null}
          </h2>
        </div>
        {present.length > 1 ? (
          <div className={s.rail}>
            <button type="button" onClick={() => setCategory(null)} className={`${s.chip} ${category === null ? s.chipOn : ''}`}>
              {t('common.all')}
            </button>
            {present.map((c) => (
              <button key={c.id} type="button" onClick={() => setCategory(c.id)} className={`${s.chip} ${category === c.id ? s.chipOn : ''}`}>
                {tr(c.name, locale)}
              </button>
            ))}
          </div>
        ) : null}
        <div className={s.grid}>
          {shown.map((product, i) => (
            <ProductCard key={product.id} product={product} locale={locale} t={t} index={i} href={`${home}/stores/${store.id}`} />
          ))}
        </div>
      </div>
      <BasketBar products={products} locale={locale} t={t} evening={evening} />
    </main>
  );
}
