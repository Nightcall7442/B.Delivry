/**
 * Home: the bazaar scene. Data is fetched here so the counters render with
 * content on first paint; the client component adds the basket and the clock.
 */
import { createT } from '@bazar/i18n';
import type { Metadata } from 'next';

import { BazaarHome } from '@/components/bazar/home';
import { DEFAULT_POINT } from '@bazar/storefront';
import { listCategories, listProducts, listStores, priceIndex } from '@/lib/catalog';
import { currentTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const [{ locale }, tenant] = await Promise.all([params, currentTenant()]);
  const t = createT(locale);
  return { title: t('meta.home', { name: tenant.name }), description: t('meta.description') };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [stores, categories, products, onSale, prices] = await Promise.all([
    // Tashkent's own stores: a test stall in another city never shows on the site.
    listStores(locale, DEFAULT_POINT),
    listCategories(locale),
    listProducts(locale, {}),
    listProducts(locale, { onSale: true }),
    // The busiest city's index: the site's home is Tashkent's, like its stalls.
    priceIndex(locale),
  ]);
  return (
    <BazaarHome
      stores={stores}
      categories={categories}
      products={products}
      onSale={onSale}
      prices={prices}
      locale={locale}
    />
  );
}
