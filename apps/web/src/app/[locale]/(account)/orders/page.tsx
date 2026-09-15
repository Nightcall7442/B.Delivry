import { OrdersScreen } from '@/components/go/orders-screen';

export const metadata = { title: 'Мои заказы — Bazar Delivery' };

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <OrdersScreen locale={locale} />;
}
