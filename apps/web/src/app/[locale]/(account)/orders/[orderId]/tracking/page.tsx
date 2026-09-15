import { redirect } from 'next/navigation';

/** Tracking is the order screen itself. */
export default async function TrackingPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  redirect(`/${locale}/orders/${orderId}`);
}
