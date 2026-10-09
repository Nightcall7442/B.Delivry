/**
 * The last boundary: the root layout itself failed, so there is no page, no theme, no provider —
 * only what is written here. Plain on purpose; every other failure is caught by `error.tsx`.
 */
'use client';

import { useEffect } from 'react';

import { reportError } from '@/lib/monitoring/client';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!error.digest) reportError(error);
  }, [error]);
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          font: '16px/1.5 system-ui, sans-serif',
          textAlign: 'center',
          background: '#123A3A',
          color: '#fff',
        }}
      >
        <div>
          <p style={{ fontSize: 20, margin: '0 0 8px' }}>Что-то пошло не так</p>
          <p style={{ margin: '0 0 20px', opacity: 0.8 }}>Nimadir xato ketdi</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              font: 'inherit',
              padding: '10px 20px',
              borderRadius: 12,
              border: 0,
              background: '#fff',
              color: '#123A3A',
              cursor: 'pointer',
            }}
          >
            Обновить · Yangilash
          </button>
        </div>
      </body>
    </html>
  );
}
