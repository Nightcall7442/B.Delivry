/**
 * Home: the bazaar scene. Data is fetched here so the counters render with
 * content on first paint; the client component adds the basket and the clock.
 */
import { BazaarHome } from '@/components/bazar/home';
import { listCategories, listProducts, listStores } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [stores, categories, products] = await Promise.all([
    listStores(locale),
    listCategories(locale),
    listProducts(locale, {}),
  ]);
  return <BazaarHome stores={stores} categories={categories} products={products} locale={locale} />;
}
