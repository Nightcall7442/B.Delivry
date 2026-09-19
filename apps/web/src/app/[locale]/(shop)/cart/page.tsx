import { BazaarCart } from '@/components/bazar/cart';
import { listProducts, listStores } from '@/lib/catalog';

export const metadata = { title: 'Корзина — Bazar Delivery' };
export const dynamic = 'force-dynamic';

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // The first page of the catalogue primes the basket; anything it holds beyond
  // that (a shop shelf is bigger than one page) the sheet fetches by id itself.
  const [products, stores] = await Promise.all([listProducts(locale), listStores(locale)]);
  return <BazaarCart products={products} stores={stores} locale={locale} />;
}
