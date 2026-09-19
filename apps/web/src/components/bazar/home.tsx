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
import {
  arrivedToday,
  chorsuTemperature,
  closesToday,
  degrees,
  isShopfront,
  photo,
  shopfronts,
  tr,
  type MapStoreDto,
} from '@bazar/storefront';
import type { CategoryDto, ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Bell } from '@/components/go/icons';
import { useAddress } from '@/features/address';
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
  stores: readonly MapStoreDto[];
  categories: readonly CategoryDto[];
  products: readonly ProductDto[];
  locale: string;
}) {
  const t = createT(locale);
  const { user } = useAuth();
  const { address } = useAddress();
  const evening = isEvening();
  // The tag's temperature is the real one at Chorsu or nothing — never a number from the code.
  const [temperature, setTemperature] = useState<number | null>(null);
  useEffect(() => {
    void chorsuTemperature().then(setTemperature);
  }, []);
  const home = `/${locale}`;

  // People first: the stalls, open ones leading. Shops are buildings and get their own rail.
  const vendors = useMemo(
    () =>
      stores
        .filter((store) => !isShopfront(store))
        .sort(
          (a, b) =>
            Number(b.isOpen) - Number(a.isOpen) || Number(!!b.ownerName) - Number(!!a.ownerName),
        ),
    [stores],
  );
  // One board per chain — the branch nearest the address takes the order.
  const shops = useMemo(() => shopfronts(stores, address?.point ?? null), [stores, address]);
  // What is on the counters: this morning's arrivals first, stalls interleaved.
  const counter = useMemo(() => {
    // Stall goods only — shop shelves live behind their boards. Open stalls lead; after
    // closing time the counters still show what they had, never the supermarket's water.
    const stalls = stores.filter((store) => !isShopfront(store));
    const all = new Set(stalls.map((store) => store.id));
    const open = new Set(stalls.filter((store) => store.isOpen).map((store) => store.id));
    const fresh = (p: ProductDto) => Number(arrivedToday(p));
    return products
      .filter((p) => p.available && all.has(p.storeId) && (open.size === 0 || open.has(p.storeId)))
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
          <span className={s.tag}>
            {/* One tag, one line: the live temperature or, at night, the closing hour. */}
            {temperature !== null
              ? `Чорсу · ${evening ? 'вечер' : 'утро'} · ${degrees(temperature)}`
              : evening
                ? 'Чорсу · вечер · до 21:00'
                : 'Чорсу · утро'}
          </span>
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
            {dateLine.charAt(0).toUpperCase() + dateLine.slice(1)} ·{' '}
            {t(evening ? 'scene.eveningLine' : 'scene.morningLine')}
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
                    <span className={s.vendorLine}>
                      «{shortLine(tr(store.ownerMotto, locale))}»
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>

        {shops.length > 0 ? (
          <>
            <div className={s.head}>
              <h2 className={s.headTitle}>{t('shop.nearby')}</h2>
            </div>
            <div className={s.rail}>
              {shops.map((store) => {
                const closes = closesToday(store);
                return (
                  <Link key={store.id} href={`${home}/stores/${store.id}`} className={s.shopSign}>
                    {store.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={store.logoUrl} alt="" className={s.shopLogo} />
                    ) : null}
                    <span className={s.shopSignName}>{tr(store.name, locale)}</span>
                    <span className={s.boardRule} />
                    <span className={s.shopSignLine}>
                      {closes ? t('shop.until', { time: closes }) : t('shop.closedToday')}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        ) : null}

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
