import { CartScreen } from '@/components/go/cart-screen';
import { listProducts, listStores } from '@/lib/catalog';

export const metadata = { title: 'Корзина — Bazar Delivery' };
export const dynamic = 'force-dynamic';

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // ponytail: the basket holds product ids only, so the page loads the whole
  // catalogue to price it. Fine at 24 products; a by-ids endpoint replaces this.
  const [products, stores] = await Promise.all([listProducts(locale), listStores(locale)]);
  return <CartScreen products={products} stores={stores} locale={locale} />;
}
