/** Route-level error boundary, in the hall like every other page (BazaarError carries `hall`). */
'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { BazaarError } from '@/components/bazar/support';
import { reportError } from '@/lib/monitoring/client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const params = useParams<{ locale?: string }>();
  useEffect(() => {
    // A server-side failure arrives here with a `digest` and its message stripped; the server has
    // already reported the real one.
    if (!(error as Error & { digest?: string }).digest) reportError(error);
  }, [error]);
  return <BazaarError locale={params?.locale === 'uz' ? 'uz' : 'ru'} onRetry={reset} />;
}
