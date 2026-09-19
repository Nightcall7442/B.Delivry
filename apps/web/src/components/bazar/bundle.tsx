/**
 * One recipe set as a walk along the counters: the dish is the scene, under it
 * the products it takes — photo cards with cardboard signs and the stall each
 * comes from — and one pomegranate bar that puts the whole dastarkhan in the
 * basket. Prices come from the live catalogue, never the set's own number.
 */
'use client';

import { createT } from '@bazar/i18n';
import {
  type Bundle,
  type MapStoreDto,
  photo,
  resolveBundle,
  tr,
  unitLabel,
} from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { ArrowLeft, Bag } from '@/components/go/icons';
import { useCartActions, useCartQuantities } from '@/features/cart';

import s from './bazar.module.css';

export function BazaarBundle({
  bundle,
  products,
  stores,
  locale,
}: {
  bundle: Bundle;
  products: readonly ProductDto[];
  stores: readonly MapStoreDto[];
  locale: string;
}) {
  const t = createT(locale);
  const router = useRouter();
  const home = `/${locale}`;
  const units = unitLabel(locale);
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const [added, setAdded] = useState(false);

  const resolved = useMemo(() => resolveBundle(bundle, products), [bundle, products]);
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const stalls = resolved.storeIds
    .map((id) => storeById.get(id))
    .filter((store): store is MapStoreDto => store !== undefined);

  const addAll = () => {
    for (const line of resolved.lines) {
      setQuantity(line.product.id, (quantities[line.product.id] ?? 0) + line.quantity);
    }
    setAdded(true);
    setTimeout(() => router.push(`${home}/cart`), 400);
  };

  return (
    <main className={s.scene}>
      <div
        className={`${s.photo} ${s.photoDim}`}
        style={{ backgroundImage: `url(${photo(bundle.photo, 1280)})` }}
      />
      <div className={s.body}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{t.n('bundle.people', bundle.serves)}</span>
        </div>

        <div className={s.greeting} style={{ minHeight: '30vh', padding: '12px 0 22px' }}>
          <h1 className={s.display} style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>
            {tr(bundle.title, locale)}
          </h1>
          <p
            className={s.hand}
            style={{
              fontSize: 22,
              margin: '8px 0 0',
              color: 'var(--cream-muted)',
              maxWidth: '44ch',
            }}
          >
            {tr(bundle.description, locale)}
          </p>
        </div>

        <div className={s.head}>
          <h2 className={s.headTitle} style={{ whiteSpace: 'nowrap' }}>
            {t.n('bundle.products', resolved.lines.length)}
          </h2>
          <span
            className={s.headAction}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {stalls.map((store) => store.ownerName ?? tr(store.name, locale)).join(' · ')}
          </span>
        </div>
        <div className={s.grid}>
          {resolved.lines.map((line, i) => {
            const stall = storeById.get(line.product.storeId);
            const qty = quantities[line.product.id] ?? 0;
            const image = line.product.images[0]?.url ?? null;
            return (
              <div key={line.product.id} className={s.card}>
                <Link
                  href={`${home}/stores/${line.product.storeId}`}
                  className={s.cardPhoto}
                  style={image ? { backgroundImage: `url(${photo(image, 960)})` } : undefined}
                  aria-label={tr(line.product.name, locale)}
                />
                <div
                  className={`${s.sign} ${i % 2 ? s.signRight : ''} ${qty > 0 ? s.signChosen : ''}`}
                  style={{ transform: `rotate(${[-1.2, 1, 0.6, -0.8][i % 4]}deg)` }}
                >
                  <div className={s.signTitle}>{tr(line.product.name, locale)}</div>
                  <div className={s.signPrice}>
                    {t.qty(line.quantity)} {units[line.product.unit]} · {t.money(line.total)}
                  </div>
                  {stall ? (
                    <div className={s.signNote}>{stall.ownerName ?? tr(stall.name, locale)}</div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setQuantity(line.product.id, qty + line.quantity)}
                    className={`${s.plus} ${qty > 0 ? s.plusChosen : ''}`}
                    aria-label={t('common.add')}
                  >
                    {qty > 0
                      ? t('scene.inCart', { count: `${t.qty(qty)} ${units[line.product.unit]}` })
                      : '+'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {resolved.missing.length > 0 ? (
          <p
            className={s.hand}
            style={{ fontSize: 20, margin: '18px 0 0', color: 'var(--cream-muted)' }}
          >
            {t.n('bundle.missing', resolved.missing.length)}
          </p>
        ) : null}
        {stalls.length > 1 ? (
          <p className={s.eyebrow} style={{ marginTop: 12 }}>
            {t('bundle.multiStall', { count: stalls.length })}
          </p>
        ) : null}
        <div style={{ height: 120 }} />
      </div>

      {resolved.lines.length > 0 ? (
        <div className={s.bar}>
          <div className={s.barInner}>
            <button type="button" onClick={addAll} disabled={added} className={s.checkout}>
              <Bag />
              <span>
                <div className={s.checkoutTitle}>
                  {added ? t('bundle.added') : t('bundle.addAll')}
                </div>
                <div className={s.checkoutSub}>
                  {t.n('bundle.products', resolved.lines.length)} · {t.money(resolved.total)}
                </div>
              </span>
              <span className={s.checkoutArrow}>→</span>
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
