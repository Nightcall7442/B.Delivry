import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BazaarLogin } from '@/components/bazar/login';

export const metadata: Metadata = { title: 'Вход — Bazar Delivery' };

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Suspense>
      <BazaarLogin locale={locale} />
    </Suspense>
  );
}
