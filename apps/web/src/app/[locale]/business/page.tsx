import { BusinessScreen } from '@/components/go/business-screen';

export const metadata = { title: 'Для бизнеса — Bazar Delivery' };

export default async function BusinessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BusinessScreen locale={locale} />;
}
