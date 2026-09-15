/**
 * Route (account)/notifications/page.tsx
 *
 */
import { PagePlaceholder } from '@/components/layout/page-placeholder';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PagePlaceholder title="Уведомления" locale={locale} />;
}
