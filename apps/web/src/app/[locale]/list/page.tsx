import { ListScreen } from '@/components/go/list-screen';
import { listProducts } from '@/lib/catalog';

export const metadata = { title: 'Список покупок — Bazar Delivery' };
export const dynamic = 'force-dynamic';

export default async function ListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // ponytail: the whole catalogue (24 products) is the parser's dictionary.
  return <ListScreen products={await listProducts(locale)} locale={locale} />;
}
