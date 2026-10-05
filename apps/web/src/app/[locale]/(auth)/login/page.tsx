import { Suspense } from 'react';

import { BazaarLogin } from '@/components/bazar/login';
import { titled } from '@/lib/metadata';

export const generateMetadata = titled('meta.login');

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <Suspense>
      <BazaarLogin locale={locale} />
    </Suspense>
  );
}
