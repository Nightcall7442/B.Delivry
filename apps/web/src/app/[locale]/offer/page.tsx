import { BazaarLegal } from '@/components/bazar/legal';
import { OFFER_RU, OFFER_UZ } from '@/content/legal/offer';

export const metadata = { title: 'Публичная оферта — Bazar Delivery' };

export default async function OfferPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BazaarLegal doc={locale === 'uz' ? OFFER_UZ : OFFER_RU} locale={locale} />;
}
