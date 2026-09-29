/**
 * Home: the bazaar scene. Data is fetched here so the counters render with
 * content on first paint; the client component adds the basket and the clock.
 */
import { BazaarHome } from '@/components/bazar/home';
import { DEFAULT_POINT } from '@bazar/storefront';
import { listCategories, listProducts, listStores } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [stores, categories, products] = await Promise.all([
    // Tashkent's own stores: a test stall in another city never shows on the site.
    listStores(locale, DEFAULT_POINT),
    listCategories(locale),
    listProducts(locale, {}),
  ]);
  return <BazaarHome stores={stores} categories={categories} products={products} locale={locale} />;
}
