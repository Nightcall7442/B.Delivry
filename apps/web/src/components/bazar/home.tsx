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
import { arrivedToday, photo, tr, unitLabel } from '@bazar/storefront';
import type { CategoryDto, ProductDto, StoreDto } from '@bazar/types';
import Link from 'next/link';
import { useMemo } from 'react';

import { Bag, Bell, Mic } from '@/components/go/icons';
import { useAuth } from '@/features/auth';
import { useCartActions, useCartQuantities } from '@/features/cart';

import s from './bazar.module.css';

/** Tashkent hour: the bazaar lives on its own clock, not the visitor's. */
const tashkentHour = (now = new Date()) => (now.getUTCHours() + 5) % 24;
const isEvening = (hour = tashkentHour()) => hour >= 17 || hour < 5;

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
  const units = unitLabel(locale);
  const { user } = useAuth();
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
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
  const inCart = counter.filter((p) => quantities[p.id]);
  const total = inCart.reduce((sum, p) => sum + p.price.amount * (quantities[p.id] ?? 0), 0);
  const stalls = new Set(inCart.map((p) => p.storeId));
  // One stall goes straight to checkout; several — the receipts decide how many trips it is.
  const checkoutHref =
    stalls.size === 1 ? `${home}/checkout?store=${[...stalls][0]}` : `${home}/cart`;

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
          {counter.map((product, i) => {
            const qty = quantities[product.id] ?? 0;
            const stall = stores.find((store) => store.id === product.storeId);
            const image = product.images[0]?.url ?? null;
            const step = product.quantityStep || 1;
            const add = () => setQuantity(product.id, qty === 0 ? product.minQuantity || step : qty + step);
            return (
              <div key={product.id} className={s.card}>
                <Link
                  href={`${home}/stores/${product.storeId}`}
                  className={s.cardPhoto}
                  style={image ? { backgroundImage: `url(${photo(image, 960)})` } : undefined}
                  aria-label={tr(product.name, locale)}
                />
                <div
                  className={`${s.sign} ${i % 2 ? s.signRight : ''} ${qty > 0 ? s.signChosen : ''}`}
                  style={{ transform: `rotate(${[-1.2, 1, 0.6, -0.8][i % 4]}deg)` }}
                >
                  <div className={s.signTitle}>{tr(product.name, locale)}</div>
                  <div className={s.signPrice}>
                    {t.money(product.price.amount)} <small>/ {units[product.unit]}</small>
                  </div>
                  {product.description ? <div className={s.signSay}>«{tr(product.description, locale)}»</div> : null}
                  <div className={s.signNote}>
                    {[stall ? (stall.ownerName ?? tr(stall.name, locale)) : null, arrivedToday(product) ? t('store.arrivedToday') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <button type="button" onClick={add} className={`${s.plus} ${qty > 0 ? s.plusChosen : ''}`} aria-label={t('common.add')}>
                    {qty > 0 ? t('scene.inCart', { count: `${t.qty(qty)} ${units[product.unit]}` }) : '+'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
              <Link href={`${home}/list`} className={s.disc} style={{ background: 'rgba(30,20,8,0.55)', boxShadow: 'none' }} aria-label={t('scene.say')}>
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
              <Link href={`${home}/cart`} className={`${s.disc} ${evening ? s.discEvening : ''}`} aria-label={t('cart.title')}>
                <Bag />
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
