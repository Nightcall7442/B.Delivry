import { BazaarOrder } from '@/components/bazar/order';

export const metadata = { title: 'Ваш заказ — Bazar Delivery' };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  return <BazaarOrder orderId={orderId} locale={locale} />;
}
