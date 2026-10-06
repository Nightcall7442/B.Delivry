import { BusinessScreen } from '@/components/go/business-screen';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('business.title');

export default async function BusinessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BusinessScreen locale={locale} />;
}
