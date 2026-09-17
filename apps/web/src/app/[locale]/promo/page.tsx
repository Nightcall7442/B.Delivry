/**
 * /promo — the scroll-driven landing: three Seedance clips scrubbed frame by
 * frame (the Apple product-page technique) and a kraft sheet with the rows.
 * Fonts (Alegreya, Caveat) come from the root layout.
 */
import { PromoLanding } from '@/components/promo/landing';

export const metadata = {
  title: 'Bazar Delivery — свежее с базара за 40 минут',
  description:
    'Продавцы Чорсу, Алайского и Фархадского — у вас в телефоне. Взвесим при вас, привезём за 40 минут.',
};

export default async function PromoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PromoLanding locale={locale} />;
}
