import { createT } from '@bazar/i18n';
import { bundleGuests, bundleTitle, getBundle } from '@bazar/storefront';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BazaarBundle } from '@/components/bazar/bundle';
import { listProducts, listStores } from '@/lib/catalog';
import { BRAND } from '@/lib/metadata';

export const dynamic = 'force-dynamic';

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ guests?: string }>;
}): Promise<Metadata> {
  const [{ locale, slug }, { guests }] = await Promise.all([params, searchParams]);
  const bundle = getBundle(slug);
  const t = createT(locale);
  if (!bundle) return { title: `${t('meta.bundleMissing')} — ${BRAND}` };
  // The tab says the same company as the page: «Плов на 12 человек», not the set's own six.
  const company = bundleGuests(bundle, guests === undefined ? null : Number(guests));
  return { title: `${bundleTitle(t, bundle, company)} — ${BRAND}` };
}

export default async function BundlePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ guests?: string }>;
}) {
  const [{ locale, slug }, { guests }] = await Promise.all([params, searchParams]);
  const bundle = getBundle(slug);
  if (!bundle) notFound();

  // The whole catalogue: a set crosses stalls, and 25 products is one page.
  const [products, stores] = await Promise.all([listProducts(locale), listStores(locale)]);
  return (
    <BazaarBundle
      bundle={bundle}
      products={products}
      stores={stores}
      guests={bundleGuests(bundle, guests === undefined ? null : Number(guests))}
      locale={locale}
    />
  );
}
