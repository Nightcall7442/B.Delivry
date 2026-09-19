import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isShopfront, tr } from '@bazar/storefront';

import { BazaarShop } from '@/components/bazar/shop';
import { BazaarStore } from '@/components/bazar/store';
import {
  getStore,
  listCategories,
  listProductPage,
  listProducts,
  listShelves,
  listStores,
} from '@/lib/catalog';

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

  // A shop is a shelf under a board: paged goods, only its own shelves, the chain's branches.
  if (isShopfront(store)) {
    const [first, shelves, stores] = await Promise.all([
      listProductPage(locale, { storeId: store.id }),
      listShelves(locale, store.id),
      listStores(locale),
    ]);
    return (
      <BazaarShop store={store} stores={stores} shelves={shelves} first={first} locale={locale} />
    );
  }

  const [products, categories] = await Promise.all([
    listProducts(locale, { storeId: store.id }),
    listCategories(locale),
  ]);
  return <BazaarStore store={store} products={products} categories={categories} locale={locale} />;
}
