import { redirect } from 'next/navigation';

import { BazaarCheckout } from '@/components/bazar/checkout';
import { getStore, listProducts } from '@/lib/catalog';

export const metadata = { title: 'Оформление заказа — Bazar Delivery' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ store?: string; stores?: string }>;
}) {
  const { locale } = await params;
  const { store: storeId, stores: extra } = await searchParams;
  const store = storeId ? await getStore(locale, storeId) : null;
  if (!store) redirect(`/${locale}/cart`);

  // Cross-bazaar: `stores=` names the other stalls of the same trip.
  const extraIds = (extra ?? '').split(',').filter((id) => id && id !== store.id);
  const extraStores = (await Promise.all(extraIds.map((id) => getStore(locale, id)))).filter(
    (row): row is NonNullable<typeof row> => row !== null,
  );
  const products = (
    await Promise.all(
      [store, ...extraStores].map((row) => listProducts(locale, { storeId: row.id })),
    )
  ).flat();
  return (
    <BazaarCheckout store={store} extraStores={extraStores} products={products} locale={locale} />
  );
}
