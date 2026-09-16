/**
 * /promo — the scroll-driven landing: three Seedance clips scrubbed frame by
 * frame (the Apple product-page technique) and a kraft sheet with the rows.
 * Fonts are the customer app's: Alegreya for display, Caveat for handwriting.
 */
import { Alegreya, Caveat } from 'next/font/google';

import { PromoLanding } from '@/components/promo/landing';

const alegreya = Alegreya({ subsets: ['latin', 'cyrillic'], weight: ['700'], variable: '--font-serif', display: 'swap' });
const caveat = Caveat({ subsets: ['latin', 'cyrillic'], weight: ['700'], variable: '--font-hand', display: 'swap' });

export const metadata = {
  title: 'Bazar Delivery — свежее с базара за 40 минут',
  description: 'Продавцы Чорсу, Алайского и Фархадского — у вас в телефоне. Взвесим при вас, привезём за 40 минут.',
};

export default async function PromoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <div className={`${alegreya.variable} ${caveat.variable}`}>
      <PromoLanding locale={locale} />
    </div>
  );
}
