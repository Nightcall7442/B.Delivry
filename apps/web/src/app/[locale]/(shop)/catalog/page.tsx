import type { Metadata } from 'next';

import { BazaarCatalog } from '@/components/bazar/catalog';
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
    listStores(locale),
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
