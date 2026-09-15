/**
 * Route support/page.tsx
 *
 */
import { PagePlaceholder } from '@/components/layout/page-placeholder';

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title="Поддержка" locale={locale} />;
}
