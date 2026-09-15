/**
 * Route-level error boundary.
 *
 */
'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container-site flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-medium">Что-то пошло не так</h1>
      <p className="text-ink-muted">Попробуйте обновить страницу.</p>
      <button type="button" onClick={reset} className="btn-primary mt-2">
        Обновить
      </button>
    </main>
  );
}
