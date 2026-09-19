import { getBundle, tr } from '@bazar/storefront';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BazaarBundle } from '@/components/bazar/bundle';
import { listProducts, listStores } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const bundle = getBundle(slug);
  return { title: bundle ? `${tr(bundle.title, locale)} — Bazar Delivery` : 'Набор не найден' };
}

export default async function BundlePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const bundle = getBundle(slug);
  if (!bundle) notFound();

  // The whole catalogue: a set crosses stalls, and 25 products is one page.
  const [products, stores] = await Promise.all([listProducts(locale), listStores(locale)]);
  return <BazaarBundle bundle={bundle} products={products} stores={stores} locale={locale} />;
}
