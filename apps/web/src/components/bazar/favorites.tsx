/**
 * «Избранное»: the stalls the customer keeps going back to as a rail of faces, then their goods as
 * photo cards with signs, newest heart first. A stall that has since been hidden is not shown; a
 * good sold out today is not on the counter, so it is not on the list either until it is back.
 */
'use client';

import { createT } from '@bazar/i18n';
import { isEvening, photo, tr, type MapStoreDto } from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { ArrowLeft } from '@/components/go/icons';
import { useAuth } from '@/features/auth';
import { useFavorites } from '@/features/favorites';
import { api } from '@/lib/api';

import { BasketBar, ProductCard } from './index';
import s from './bazar.module.css';

/** One page of the catalogue by id: the newest hearts are the ones that matter. */
const SHOWN = 100;

export function BazaarFavorites({ locale }: { locale: string }) {
  const t = createT(locale);
  const home = `/${locale}`;
  const { user, ready: authReady } = useAuth();
  const favorites = useFavorites();
  const productKey = favorites.product.slice(0, SHOWN).join(',');
  const storeKey = favorites.store.slice(0, SHOWN).join(',');
  const [data, setData] = useState<{ products: ProductDto[]; stores: MapStoreDto[] } | null>(null);

  useEffect(() => {
    if (!user || !favorites.ready) return;
    let alive = true;
    const productIds = productKey ? productKey.split(',') : [];
    const storeIds = storeKey ? storeKey.split(',') : [];
    Promise.all([
      productIds.length > 0
        ? api()
            .catalog.products({ ids: productIds, pageSize: SHOWN })
            .then((page) => page.items)
        : Promise.resolve([]),
      Promise.all(
        storeIds.map((id) =>
          api()
            .stores.get(id)
            .catch(() => null),
        ),
      ),
    ])
      .then(([products, stores]) => {
        if (!alive) return;
        setData({
          products,
          stores: stores.filter((store): store is MapStoreDto => store?.point != null),
        });
      })
      .catch(() => alive && setData({ products: [], stores: [] }));
    return () => {
      alive = false;
    };
  }, [user, favorites.ready, productKey, storeKey]);

  // In the order of the hearts, not of the catalogue.
  const products = useMemo(() => {
    const byId = new Map((data?.products ?? []).map((p) => [p.id, p]));
    return favorites.product.flatMap((id) => byId.get(id) ?? []);
  }, [data, favorites.product]);
  const stores = useMemo(
    () => (data?.stores ?? []).filter((store) => favorites.store.includes(store.id)),
    [data, favorites.store],
  );
  const empty = favorites.product.length === 0 && favorites.store.length === 0;

  return (
    <main className={`hall ${s.scene}`}>
      <div className={s.body}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
        </div>

        <div className={s.greeting}>
          <h1 className={`${s.display} ${s.displayPage}`}>{t('fav.title')}</h1>
          {!authReady ? null : !user ? (
            <>
              <p className={s.say} style={{ maxWidth: '40ch', margin: '10px 0 16px' }}>
                {t('fav.guest')}
              </p>
              <Link
                href={`${home}/login?next=${encodeURIComponent(`${home}/favorites`)}`}
                className="btn-go"
              >
                {t('common.signIn')}
              </Link>
            </>
          ) : favorites.ready && empty ? (
            <>
              <p className={s.say} style={{ maxWidth: '40ch', margin: '10px 0 0' }}>
                {t('fav.empty')}
              </p>
              <Link
                href={`${home}/catalog`}
                className={`${s.pill} ${s.pillSolid}`}
                style={{ marginTop: 16 }}
              >
                {t('common.toStores')} →
              </Link>
            </>
          ) : null}
        </div>

        {stores.length > 0 ? (
          <>
            <div className={s.head}>
              <h2 className={s.headTitle}>{t('fav.stores')}</h2>
            </div>
            <div className={s.rail}>
              {stores.map((store) => {
                const face = store.ownerPhotoUrl ?? store.counterPhotoUrl ?? store.coverUrl;
                return (
                  <Link
                    key={store.id}
                    href={`${home}/stores/${store.id}`}
                    className={`${s.vendor} ${face ? 'photo-grade' : ''}`}
                    style={face ? { backgroundImage: `url(${photo(face, 500)})` } : undefined}
                  >
                    <span className={s.vendorText}>
                      <span className={s.vendorName}>
                        {store.ownerName ?? tr(store.name, locale)}
                      </span>
                      {store.reviewCount > 0 ? (
                        <span className={s.vendorLine}>★ {store.rating.toFixed(1)}</span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        ) : null}

        {products.length > 0 ? (
          <>
            <div className={s.head}>
              <h2 className={s.headTitle}>{t('fav.products')}</h2>
            </div>
            {products.some((product) => !product.available) ? (
              <p className={s.say}>{t('fav.backHint')}</p>
            ) : null}
            <div className={s.grid}>
              {products.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  locale={locale}
                  t={t}
                  index={i}
                  href={`${home}/stores/${product.storeId}`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
      <BasketBar products={products} locale={locale} t={t} evening={isEvening()} />
    </main>
  );
}
