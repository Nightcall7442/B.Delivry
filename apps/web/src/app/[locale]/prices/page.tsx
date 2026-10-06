import { PricesScreen } from '@/components/go/prices-screen';
import { priceIndex } from '@/lib/catalog';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('prices.title');
export const dynamic = 'force-dynamic';

export default async function PricesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ city?: string }>;
}) {
  const [{ locale }, { city }] = await Promise.all([params, searchParams]);
  return <PricesScreen locale={locale} index={await priceIndex(locale, city)} />;
}
