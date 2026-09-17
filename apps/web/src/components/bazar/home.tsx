/**
 * The front door on the web, as in the app: a photograph of the rows fills
 * the window (morning or evening by Tashkent time), the greeting sits on it,
 * then the people at their counters, the rows to walk along, and everything
 * on the counters today as photo cards with a cardboard sign you can take
 * straight into the basket. Once the basket has something in it the voice
 * line at the bottom gives way to «Оформить».
 */
'use client';

import { createT } from '@bazar/i18n';
import { arrivedToday, photo, tr } from '@bazar/storefront';
import type { CategoryDto, ProductDto, StoreDto } from '@bazar/types';
import Link from 'next/link';
import { useMemo } from 'react';

import { Bell } from '@/components/go/icons';
import { useAuth } from '@/features/auth';

import { BasketBar, ProductCard, isEvening } from './index';
import s from './bazar.module.css';

/** The motto is a sentence; the card has room for four words of it. */
function shortLine(text: string): string {
  const words = text.replace(/[.!…]+$/, '').split(' ');
  return words.length <= 4 ? words.join(' ') : `${words.slice(0, 4).join(' ')}…`;
}

export function BazaarHome({
  stores,
  categories,
  products,
  locale,
}: {
  stores: readonly StoreDto[];
  categories: readonly CategoryDto[];
  products: readonly ProductDto[];
  locale: string;
}) {
  const t = createT(locale);
  const { user } = useAuth();
  const evening = isEvening();
  const home = `/${locale}`;

  // People first: a stall with a named owner is a person, a supermarket is a building; open ones lead.
  const vendors = useMemo(
    () =>
      [...stores].sort(
        (a, b) => Number(b.isOpen) - Number(a.isOpen) || Number(!!b.ownerName) - Number(!!a.ownerName),
      ),
    [stores],
  );
  // What is on the counters: this morning's arrivals first, stalls interleaved.
  const counter = useMemo(() => {
    const open = new Set(stores.filter((store) => store.isOpen).map((store) => store.id));
    const fresh = (p: ProductDto) => Number(arrivedToday(p));
    return products
      .filter((p) => p.available && (open.size === 0 || open.has(p.storeId)))
      .sort((a, b) => fresh(b) - fresh(a) || a.storeId.localeCompare(b.storeId));
  }, [products, stores]);

  const dateLine = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tashkent',
  }).format(new Date());

  return (
    <main className={s.scene}>
      <div
        className={`${s.photo} ${evening ? s.photoEvening : ''}`}
        style={{ backgroundImage: `url(/scenes/${evening ? 'evening' : 'morning'}.jpg)` }}
      />
      <div className={s.body}>
        <div className={s.top}>
          <span className={s.tag}>{evening ? 'Чорсу · вечер · до 21:00' : 'Чорсу · утро · +18°'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`${home}/orders`} className={s.round} aria-label={t('menu.orders')}>
              <b>
                <Bell />
              </b>
            </Link>
            <Link href={`${home}/profile`} className={s.round} aria-label={t('profile.title')}>
              <b>{(user?.firstName ?? 'А').slice(0, 1).toUpperCase()}</b>
            </Link>
          </div>
        </div>

        <div className={s.greeting}>
          <div className={s.eyebrow}>
            {dateLine.charAt(0).toUpperCase() + dateLine.slice(1)} · {t(evening ? 'scene.eveningLine' : 'scene.morningLine')}
          </div>
          <h1 className={`${s.display} ${evening ? s.displayEvening : ''}`}>
            {t(evening ? 'scene.evening' : 'scene.morning')}
            {user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
        </div>

        <div className={s.head}>
          <h2 className={s.headTitle}>{t('scene.vendorsHere')}</h2>
          <Link href={`${home}/stores`} className={s.headAction}>
            {t('scene.vendorsAll', { count: stores.length })}
          </Link>
        </div>
        <div className={s.rail}>
          {vendors.map((store) => {
            const face = store.ownerPhotoUrl ?? store.counterPhotoUrl ?? store.coverUrl;
            return (
              <Link
                key={store.id}
                href={`${home}/stores/${store.id}`}
                className={s.vendor}
                style={face ? { backgroundImage: `url(${photo(face, 500)})` } : undefined}
              >
                <span className={s.vendorText}>
                  <span className={s.vendorName}>{store.ownerName ?? tr(store.name, locale)}</span>
                  {store.ownerMotto ? (
                    <span className={s.vendorLine}>«{shortLine(tr(store.ownerMotto, locale))}»</span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>

        <div className={s.head}>
          <h2 className={s.headTitle}>{t('scene.walkRow')}</h2>
          <Link href={`${home}/catalog`} className={s.headAction}>
            {t('scene.rowsAll')}
          </Link>
        </div>
        <div className={s.rail}>
          {categories.slice(0, 8).map((category, i) => (
            <Link
              key={category.id}
              href={`${home}/catalog?category=${category.id}`}
              className={s.rowSign}
              style={{ transform: `rotate(${[-1.5, 1, -1, 1.5][i % 4]}deg)` }}
            >
              <span className={s.pin} />
              {tr(category.name, locale)}
            </Link>
          ))}
        </div>

        <div className={s.head}>
          <h2 className={s.headTitle}>{t('scene.onCounterToday')}</h2>
        </div>
        <div className={s.grid}>
          {counter.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              stall={stores.find((store) => store.id === product.storeId)}
              locale={locale}
              t={t}
              index={i}
              href={`${home}/stores/${product.storeId}`}
            />
          ))}
        </div>
      </div>

      <BasketBar products={counter} locale={locale} t={t} evening={evening} />
    </main>
  );
}
