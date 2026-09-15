/**
 * Route (account)/profile/page.tsx
 *
 */
import { PagePlaceholder } from '@/components/layout/page-placeholder';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title="Профиль" locale={locale} />;
}
