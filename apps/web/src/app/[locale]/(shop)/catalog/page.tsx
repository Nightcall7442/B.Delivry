import type { Metadata } from 'next';

import { BazaarCatalog } from '@/components/bazar/catalog';
import { DEFAULT_POINT } from '@bazar/storefront';
import { listCategories, listProducts, listStores } from '@/lib/catalog';

export const metadata: Metadata = { title: 'Карта рядов — Bazar Delivery' };
export const dynamic = 'force-dynamic';

type Search = { category?: string; q?: string };

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  const { category = null, q = '' } = await searchParams;

  const [categories, stores, products] = await Promise.all([
    listCategories(locale),
    // Tashkent's own stores: a test stall in another city never shows on the site.
    listStores(locale, DEFAULT_POINT),
    listProducts(locale, {
      ...(category ? { categoryId: category } : {}),
      ...(q ? { search: q } : {}),
    }),
  ]);

  return (
    <BazaarCatalog
      products={products}
      stores={stores}
      categories={categories}
      locale={locale}
      query={q}
      category={category}
    />
  );
}
