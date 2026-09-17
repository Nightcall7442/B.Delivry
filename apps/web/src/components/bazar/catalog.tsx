/**
 * The catalogue as a plan of the bazaar drawn on kraft: you come in at the
 * top and walk down the aisle, counters on both sides. Each counter is a row
 * (a category) with its cardboard sign, the faces selling there and how much
 * is on the counter today. Open a row — or search — and it is the counters
 * themselves: photo cards grouped by the stall the courier picks up at.
 */
'use client';

import { createT } from '@bazar/i18n';
import { photo, tr, type MapStoreDto } from '@bazar/storefront';
import type { CategoryDto, ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { ArrowLeft } from '@/components/go/icons';

import { BasketBar, ProductCard, isEvening } from './index';
import s from './bazar.module.css';

export function BazaarCatalog({
  products,
  stores,
  categories,
  locale,
  query,
  category,
}: {
  products: readonly ProductDto[];
  stores: readonly MapStoreDto[];
  categories: readonly CategoryDto[];
  locale: string;
  query: string;
  category: string | null;
}) {
  const t = createT(locale);
  const router = useRouter();
  const evening = isEvening();
  const home = `/${locale}`;
  const base = `${home}/catalog`;
  const href = (next: { q?: string; category?: string | null }) => {
    const params = new URLSearchParams();
    const q = next.q ?? query;
    const c = next.category === undefined ? category : next.category;
    if (q) params.set('q', q);
    if (c) params.set('category', c);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const walking = Boolean(category || query);
  const current = categories.find((c) => c.id === category) ?? null;

  // Per row: what is on the counters today and who is standing behind them.
  const rows = useMemo(() => {
    const byCategory = new Map<string, { count: number; storeIds: Set<string> }>();
    for (const product of products) {
      if (!product.categoryId || !product.available) continue;
      const row = byCategory.get(product.categoryId) ?? { count: 0, storeIds: new Set<string>() };
      row.count += 1;
      row.storeIds.add(product.storeId);
      byCategory.set(product.categoryId, row);
    }
    return categories.map((cat) => {
      const row = byCategory.get(cat.id);
      return {
        category: cat,
        count: row?.count ?? 0,
        stalls: stores.filter((store) => row?.storeIds.has(store.id)),
      };
    });
  }, [categories, stores, products]);
  const stallCount = new Set(rows.flatMap((row) => row.stalls.map((store) => store.id))).size;
  // Counters face each other across the aisle: two per step, walking down.
  const pairs = rows.flatMap((row, i) => (i % 2 === 0 ? [[row, rows[i + 1]] as const] : []));

  const groups = stores
    .map((store) => ({
      store,
      items: products.filter((p) => p.storeId === store.id && p.available),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <main className={s.scene}>
      <div
        className={`${s.photo} ${s.photoDim} ${evening ? s.photoEvening : ''}`}
        style={{ backgroundImage: `url(/scenes/${evening ? 'evening' : 'morning'}.jpg)` }}
      />
      <div className={s.body}>
        <div className={s.top}>
          <Link href={walking ? base : home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{t('map.title')}</span>
        </div>

        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 22px' }}>
          <h1 className={s.display} style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>
            {current ? tr(current.name, locale) : query ? `«${query}»` : t('map.title')}
          </h1>
          <form
            className={s.search}
            onSubmit={(event) => {
              event.preventDefault();
              router.push(
                href({
                  q: String(new FormData(event.currentTarget).get('q') ?? ''),
                  category: null,
                }),
              );
            }}
          >
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder={t('search.placeholder')}
              autoComplete="off"
            />
          </form>
        </div>

        {walking ? (
          <>
            <div className={s.rail}>
              <Link
                href={href({ category: null, q: '' })}
                className={`${s.chip} ${!category && !query ? s.chipOn : ''}`}
              >
                {t('common.all')}
              </Link>
              {rows
                .filter((row) => row.count > 0 || row.category.id === category)
                .map((row) => (
                  <Link
                    key={row.category.id}
                    href={href({ category: row.category.id, q: '' })}
                    className={`${s.chip} ${category === row.category.id ? s.chipOn : ''}`}
                  >
                    {tr(row.category.name, locale)}
                  </Link>
                ))}
            </div>
            {groups.length === 0 ? (
              <section className={`${s.receipt} ${s.narrowSlip}`}>
                <p className={s.rcEmpty}>{t('map.empty')}</p>
                <p className={s.rcHint}>{t('search.empty')}</p>
              </section>
            ) : (
              groups.map(({ store, items }) => (
                <section key={store.id}>
                  <div className={s.head}>
                    <h2 className={s.headTitle}>{store.ownerName ?? tr(store.name, locale)}</h2>
                    <Link href={`${home}/stores/${store.id}`} className={s.headAction}>
                      {store.ownerName ? tr(store.name, locale) : ''} →
                    </Link>
                  </div>
                  <div className={s.grid}>
                    {items.map((product, i) => (
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
                </section>
              ))
            )}
          </>
        ) : (
          <div className={s.kraft}>
            <div className={s.kraftEyebrow}>
              {t.n('map.rows', rows.length)} · {t.n('map.stalls', stallCount)}
            </div>
            <div className={s.gate}>
              <span />
              <span className={s.gateText}>{t('map.entrance')}</span>
              <span />
            </div>
            <div className={s.hall}>
              {pairs.map(([left, right]) => (
                <div key={left.category.id} className={s.pair}>
                  {counter(left, -0.6)}
                  <span className={s.stepDown}>↓</span>
                  {right ? counter(right, 0.6) : <span />}
                </div>
              ))}
            </div>
            <div className={s.dome}>{t('map.dome')}</div>
          </div>
        )}
      </div>
      {walking ? <BasketBar products={products} locale={locale} t={t} evening={evening} /> : null}
    </main>
  );

  function counter({ category: cat, count, stalls }: (typeof rows)[number], tilt: number) {
    const empty = count === 0;
    const names = stalls.map((store) => store.ownerName ?? tr(store.name, locale));
    return (
      <Link
        href={href({ category: cat.id, q: '' })}
        className={`${s.counter} ${empty ? s.counterEmpty : ''}`}
        aria-disabled={empty}
        onClick={(e) => empty && e.preventDefault()}
      >
        <span
          className={s.rowSign}
          style={{
            transform: `rotate(${tilt}deg)`,
            marginTop: -22,
            fontSize: 17,
            alignSelf: 'flex-start',
          }}
        >
          <span className={s.pin} />
          {tr(cat.name, locale)}
        </span>
        {empty ? (
          <span className={s.counterHint}>{t('map.empty')}</span>
        ) : (
          <>
            <span className={s.faces}>
              {stalls.slice(0, 4).map((store, i) => {
                const face = store.ownerPhotoUrl ?? store.coverUrl;
                return (
                  <span
                    key={store.id}
                    className={s.face}
                    style={face ? { backgroundImage: `url(${photo(face, 250)})` } : undefined}
                  >
                    {face ? '' : names[i]?.slice(0, 1)}
                  </span>
                );
              })}
              <span className={s.faceNames}>{names.join(' · ')}</span>
            </span>
            <span className={s.counterCount}>{t.n('categories.items', count)} →</span>
          </>
        )}
      </Link>
    );
  }
}
