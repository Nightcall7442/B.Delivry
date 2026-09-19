import { BazaarSupport } from '@/components/bazar/support';

export const metadata = { title: 'Поддержка — Bazar Delivery' };

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarSupport locale={locale} />;
}
