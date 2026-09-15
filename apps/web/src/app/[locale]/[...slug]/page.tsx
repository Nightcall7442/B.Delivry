/**
 * Route [...slug]/page.tsx
 *
 */
import { PagePlaceholder } from '@/components/layout/page-placeholder';

export default async function CatchAllPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title="Скоро" locale={locale} />;
}
