import { BazaarOrders } from '@/components/bazar/orders';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('orders.title');

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarOrders locale={locale} />;
}
