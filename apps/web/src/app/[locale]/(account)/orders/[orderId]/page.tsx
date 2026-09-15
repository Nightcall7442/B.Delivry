import { OrderScreen } from '@/components/go/order-screen';

export const metadata = { title: 'Ваш заказ — Bazar Delivery' };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  return <OrderScreen orderId={orderId} locale={locale} />;
}
