/**
 * /promo — the scroll-driven landing: three Seedance clips scrubbed frame by
 * frame (the Apple product-page technique) and a kraft sheet with the rows.
 * Fonts (Alegreya, Caveat) come from the root layout.
 */
import { createT } from '@bazar/i18n';
import type { Metadata } from 'next';

import { PromoLanding } from '@/components/promo/landing';
import { BRAND } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = createT((await params).locale);
  return { title: t('meta.promo', { name: BRAND }), description: t('meta.promoDescription') };
}

export default async function PromoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PromoLanding locale={locale} />;
}
