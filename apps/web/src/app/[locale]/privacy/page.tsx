import { BazaarLegal } from '@/components/bazar/legal';
import { PRIVACY_RU, PRIVACY_UZ } from '@/content/legal/privacy';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('footer.privacy');

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarLegal doc={locale === 'uz' ? PRIVACY_UZ : PRIVACY_RU} locale={locale} />;
}
