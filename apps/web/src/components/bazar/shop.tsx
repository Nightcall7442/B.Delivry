/**
 * A shop on the web, as in the app: a painted board over the door instead of
 * a person behind a counter, then a search line, the shelves the shop really
 * stocks, and the goods as photo cards that keep coming as you scroll. Two
 * shortcuts a grocery run needs: «Как в прошлый раз» and «Собрать по списку».
 */
'use client';

import { createT } from '@bazar/i18n';
import { branchesOf, closesToday, photo, tr, type MapStoreDto } from '@bazar/storefront';
import type { Paginated } from '@bazar/api-client';
import type { CategoryDto, OrderDto, ProductDto } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ArrowLeft, Mic, Search } from '@/components/go/icons';
import { useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { useCartActions, useCartQuantities } from '@/features/cart';
import { api } from '@/lib/api';
import { SHELF_PAGE } from '@/lib/catalog';

import { BasketBar, ProductCard, isEvening } from './index';
import s from './bazar.module.css';

export function BazaarShop({
  store,
  stores,
  shelves,
  first,
  locale,
}: {
  store: MapStoreDto;
  stores: readonly MapStoreDto[];
  shelves: readonly CategoryDto[];
  /** The first page, rendered on the server so the shelf is full on first paint. */
  first: Paginated<ProductDto>;
  locale: string;
}) {
  const t = createT(locale);
  const { user } = useAuth();
  const { address } = useAddress();
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const evening = isEvening();
  const home = `/${locale}`;

  const [category, setCategory] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ProductDto[]>(first.items);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(first.pagination.hasNext);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  // Typing waits for a pause; the request goes for the settled word.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  const load = async (next: number, replace: boolean) => {
    const id = ++request.current;
    setLoading(true);
    try {
      const result = await api().catalog.products({
        storeId: store.id,
        ...(category ? { categoryId: category } : {}),
        ...(search ? { search } : {}),
        page: next,
        pageSize: SHELF_PAGE,
      });
      if (id !== request.current) return;
      setItems((current) => (replace ? result.items : [...current, ...result.items]));
      setPage(next);
      setHasNext(result.pagination.hasNext);
    } catch {
      // The shelf keeps what it has; the next scroll tries again.
    } finally {
      if (id === request.current) setLoading(false);
    }
  };
  // The server rendered page one of the unfiltered shelf; every filter change refetches.
  const filtered = useRef(false);
  useEffect(() => {
    if (!filtered.current && category === null && search === '') return;
    filtered.current = true;
    void load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, search]);
  // More goods arrive when the end of the shelf scrolls into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNext) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading) void load(page + 1, false);
    });
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext, loading, page, category, search]);

  // «Как в прошлый раз»: the last delivered order from this shop, one click to refill the basket.
  const [last, setLast] = useState<OrderDto | null>(null);
  const [refilled, setRefilled] = useState(false);
  useEffect(() => {
    if (!user) return;
    api()
      .orders.list({ storeId: store.id, status: 'DELIVERED', pageSize: 1 })
      .then((result) => setLast(result.items[0] ?? null))
      .catch(() => setLast(null));
  }, [user, store.id]);
  const refill = () => {
    if (!last) return;
    for (const line of last.items) {
      if (line.productId)
        setQuantity(line.productId, (quantities[line.productId] ?? 0) + line.quantity);
    }
    setRefilled(true);
  };

  const branch = useMemo(() => {
    const all = branchesOf(store, stores, address?.point ?? null);
    return all.length > 1 ? all[0]! : null;
  }, [store, stores, address]);
  const closes = closesToday(store);
  const hero = store.counterPhotoUrl ?? store.coverUrl ?? null;

  return (
    <main className={s.scene}>
      {hero ? (
        <div
          className={`${s.photo} ${s.photoStall}`}
          style={{ backgroundImage: `url(${photo(hero, 1280)})` }}
        />
      ) : null}
      <div className={s.body}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>
            {t(`store.type.${store.type}` as 'store.type.SHOP')} ·{' '}
            {closes ? t('shop.until', { time: closes }) : t('shop.closedToday')}
          </span>
        </div>

        {/* The photograph breathes first; the painted board hangs over its lower edge. */}
        <section className={s.board} style={{ marginTop: hero ? '34vh' : undefined }}>
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt="" className={s.boardLogo} />
          ) : null}
          <h1 className={s.boardName}>{tr(store.name, locale)}</h1>
          <div className={s.boardRule} />
          <p className={s.boardLine}>
            {branch
              ? t('shop.branch', { address: branch.address ?? tr(branch.name, locale) })
              : store.address}
          </p>
          <div className={s.pills}>
            {store.minOrder ? (
              <span className={s.pill}>{t('shop.minOrder', { sum: t.money(store.minOrder) })}</span>
            ) : null}
            {store.freeDeliveryThreshold ? (
              <span className={s.pill}>
                {t('shop.freeFrom', { sum: t.money(store.freeDeliveryThreshold) })}
              </span>
            ) : null}
            <span className={s.pill}>{t('store.prep', { minutes: store.preparationMinutes })}</span>
            {!store.isOpen ? (
              <span className={`${s.pill} ${s.pillWarn}`}>{t('store.closedHint')}</span>
            ) : null}
          </div>
        </section>

        <div className={s.shortcuts}>
          {last && last.items.length > 0 ? (
            <button type="button" onClick={refill} disabled={refilled} className={s.shortcut}>
              <span className={s.shortcutTitle}>
                {refilled ? t('shop.lastTimeAdded') : t('shop.lastTime')}
              </span>
              <span className={s.shortcutHint}>
                {t('shop.lastTimeHint', {
                  items: t.n('cart.items', last.items.length),
                  sum: t.money(last.totals.total.amount),
                })}
              </span>
            </button>
          ) : null}
          <Link href={`${home}/list`} className={`${s.shortcut} ${s.shortcutList}`}>
            <span className={s.shortcutTitle}>
              <Mic /> {t('shop.byList')}
            </span>
            <span className={s.shortcutHint}>{t('shop.byListHint')}</span>
          </Link>
        </div>

        <label className={s.searchLine}>
          <Search />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('shop.search')}
            type="search"
            className={s.searchInput}
          />
        </label>

        <div className={s.head}>
          <h2 className={s.headTitle}>{t('shop.shelves')}</h2>
        </div>
        <div className={`${s.rail} ${s.shelves}`}>
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={`${s.chip} ${category === null ? s.chipOn : ''}`}
          >
            {t('common.all')}
          </button>
          {shelves.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(category === c.id ? null : c.id)}
              className={`${s.chip} ${category === c.id ? s.chipOn : ''}`}
            >
              {tr(c.name, locale)}
            </button>
          ))}
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
        {items.length === 0 && !loading ? (
          <p className={s.hand} style={{ fontSize: 22, color: 'var(--cream-muted)' }}>
            {search ? t('shop.notFound') : t('shop.empty')}
          </p>
        ) : null}
        <div ref={sentinel} className={s.more}>
          {loading ? t('shop.loading') : ''}
        </div>
      </div>
      <BasketBar products={items} locale={locale} t={t} evening={evening} />
    </main>
  );
}
