import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoginScreen } from '@/components/go/login-screen';

export const metadata: Metadata = { title: 'Вход — Bazar Delivery' };

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Suspense>
      <LoginScreen locale={locale} />
    </Suspense>
  );
}
