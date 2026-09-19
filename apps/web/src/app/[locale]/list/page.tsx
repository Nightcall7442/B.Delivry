import { ListScreen } from '@/components/go/list-screen';
import { listProducts } from '@/lib/catalog';

export const metadata = { title: 'Список покупок — Bazar Delivery' };
export const dynamic = 'force-dynamic';

export default async function ListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // ponytail: the first page of the catalogue (100 products) is the parser's dictionary;
  // a search endpoint per parsed line replaces this once shops carry thousands of SKUs.
  return <ListScreen products={await listProducts(locale)} locale={locale} />;
}
