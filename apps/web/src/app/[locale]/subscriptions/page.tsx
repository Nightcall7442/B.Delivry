import { SubscriptionsScreen } from '@/components/go/subscriptions-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('subs.title');

export default async function SubscriptionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <SubscriptionsScreen locale={locale} />;
}
