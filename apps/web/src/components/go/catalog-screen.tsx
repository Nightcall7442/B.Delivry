/**
 * Search across every stall: the same tiles as a store, grouped by where the
 * courier will pick them up.
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CategoryDto, ProductDto } from '@bazar/types';
import { type MapStoreDto, tr } from '@bazar/storefront';
import { createT } from '@bazar/i18n';

import { GoShell } from '@/components/go/go-shell';
import { Chevron } from '@/components/go/icons';
import { ProductTile } from '@/components/go/product-tile';

export function CatalogScreen({
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
  const base = `/${locale}/catalog`;
  const href = (next: { q?: string; category?: string | null }) => {
    const params = new URLSearchParams();
    const q = next.q ?? query;
    const c = next.category === undefined ? category : next.category;
    if (q) params.set('q', q);
    if (c) params.set('category', c);
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  };

  const groups = stores
    .map((store) => ({ store, items: products.filter((p) => p.storeId === store.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <GoShell
      locale={locale}
      back={`/${locale}`}
      peek={0.62}
      expanded
      header={
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              router.push(href({ q: String(new FormData(event.currentTarget).get('q') ?? '') }));
            }}
          >
            <input
              name="q"
              type="search"
              defaultValue={query}
              className="go-field"
              placeholder={t('search.placeholder')}
              autoComplete="off"
              autoFocus={!query}
            />
          </form>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              href={href({ category: null })}
              className="go-chip"
              aria-current={category === null ? 'true' : undefined}
            >
              {t('common.all')}
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={href({ category: c.id })}
                className="go-chip"
                aria-current={category === c.id ? 'true' : undefined}
              >
                {tr(c.name, locale)}
              </Link>
            ))}
          </div>
        </>
      }
    >
      {groups.length === 0 ? (
        <p className="py-10 text-center text-ink-muted">{t('search.empty')}</p>
      ) : (
        groups.map(({ store, items }) => (
          <section key={store.id} className="mt-4">
            <Link
              href={`/${locale}/stores/${store.id}`}
              className="flex items-center justify-between py-1"
            >
              <h2 className="font-display text-lg font-extrabold">{tr(store.name, locale)}</h2>
              <Chevron />
            </Link>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-2">
              {items.map((product) => (
                <ProductTile key={product.id} product={product} locale={locale} />
              ))}
            </div>
          </section>
        ))
      )}
    </GoShell>
  );
}
