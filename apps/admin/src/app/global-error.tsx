/**
 * The last boundary: the root layout itself failed, so there is no page, no theme, no provider —
 * only what is written here (the stylesheet belongs to the layout, so it is inline). Plain on
 * purpose; every failure inside the desk is caught by `(dashboard)/error.tsx`.
 */
'use client';

import { useEffect } from 'react';

import { reportError } from '@/lib/monitoring/report';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // A server-side failure arrives here with a `digest` and its message stripped; the server has
    // already reported the real one.
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
          color: '#FBF1DE',
        }}
      >
        <div>
          <p style={{ fontSize: 20, margin: '0 0 8px' }}>Что-то пошло не так</p>
          <p style={{ margin: '0 0 20px', opacity: 0.8 }}>Страница не открылась.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              font: 'inherit',
              padding: '10px 20px',
              borderRadius: 999,
              border: 0,
              background: '#FBF1DE',
              color: '#123A3A',
              cursor: 'pointer',
            }}
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
