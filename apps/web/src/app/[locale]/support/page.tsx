import { BazaarSupport } from '@/components/bazar/support';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('support.title');

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarSupport locale={locale} />;
}
