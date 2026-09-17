import { BazaarProfile } from '@/components/bazar/profile';

export const metadata = { title: 'Профиль — Bazar Delivery' };

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarProfile locale={locale} />;
}
