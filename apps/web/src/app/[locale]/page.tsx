/**
 * Home: map + sheet. Data is fetched here so the sheet renders with content
 * on first paint; the client component only adds the address and the map.
 */
import { HomeScreen } from '@/components/go/home-screen';
import { listCategories, listProducts, listStores } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [stores, categories, products] = await Promise.all([
    listStores(locale),
    listCategories(locale),
    listProducts(locale, {}),
  ]);
  return <HomeScreen stores={stores} categories={categories} products={products} locale={locale} />;
}
