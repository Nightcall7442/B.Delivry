import { BazaarOrder } from '@/components/bazar/order';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('checkout.orderTitle');

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  return <BazaarOrder orderId={orderId} locale={locale} />;
}
