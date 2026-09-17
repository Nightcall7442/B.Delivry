import { BazaarOrders } from '@/components/bazar/orders';

export const metadata = { title: 'Мои заказы — Bazar Delivery' };

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarOrders locale={locale} />;
}
