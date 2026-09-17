import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { tr } from '@bazar/storefront';

import { BazaarStore } from '@/components/bazar/store';
import { getStore, listCategories, listProducts } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; storeId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, storeId } = await params;
  const store = await getStore(locale, storeId);
  return { title: store ? `${tr(store.name, locale)} — Bazar Delivery` : 'Магазин не найден' };
}

export default async function StorePage({ params }: { params: Params }) {
  const { locale, storeId } = await params;
  const store = await getStore(locale, storeId);
  if (!store) notFound();

  const [products, categories] = await Promise.all([
    listProducts(locale, { storeId: store.id }),
    listCategories(locale),
  ]);
  return <BazaarStore store={store} products={products} categories={categories} locale={locale} />;
}
