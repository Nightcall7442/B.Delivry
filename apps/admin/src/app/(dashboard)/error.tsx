/** A page of the desk failed to draw: the menu stays, the page is replaced by this. */
'use client';

import { useEffect } from 'react';

import { reportError } from '@/lib/monitoring/report';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A server-side failure arrives here with a `digest` and its message stripped; the server has
    // already reported the real one.
    if (!error.digest) reportError(error);
  }, [error]);
  return (
    <div className="max-w-md pt-6">
      <div className="eyebrow">Ошибка</div>
      <h1 className="font-display mt-1 text-headline font-bold">Страница не открылась</h1>
      <p className="font-display mt-2 text-lead italic" style={{ color: 'var(--cream-muted)' }}>
        Остальные разделы работают: выберите другой в меню или попробуйте ещё раз.
      </p>
      <button type="button" className="btn-primary mt-5" onClick={reset}>
        Повторить
      </button>
    </div>
  );
}
