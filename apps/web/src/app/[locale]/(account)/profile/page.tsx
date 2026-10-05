import { BazaarProfile } from '@/components/bazar/profile';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('profile.title');

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarProfile locale={locale} />;
}
