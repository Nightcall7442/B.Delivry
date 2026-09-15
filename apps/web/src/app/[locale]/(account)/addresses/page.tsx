/**
 * Route (account)/addresses/page.tsx
 *
 */
import { PagePlaceholder } from '@/components/layout/page-placeholder';

export default async function AddressesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title="Мои адреса" locale={locale} />;
}
