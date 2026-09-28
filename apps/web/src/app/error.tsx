/** Route-level error boundary, in the hall like every other page (BazaarError carries `hall`). */
'use client';

import { useParams } from 'next/navigation';

import { BazaarError } from '@/components/bazar/support';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  return <BazaarError locale={params?.locale === 'uz' ? 'uz' : 'ru'} onRetry={reset} />;
}
