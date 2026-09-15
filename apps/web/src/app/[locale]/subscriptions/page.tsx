import { SubscriptionsScreen } from '@/components/go/subscriptions-screen';

export const metadata = { title: 'Подписки — Bazar Delivery' };

export default async function SubscriptionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <SubscriptionsScreen locale={locale} />;
}
