/**
 * 404 page.
 *
 */
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="container-site flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-6xl font-bold text-brand-500">404</p>
      <h1 className="text-2xl font-medium">Страница не найдена</h1>
      <Link href="/ru" className="btn-primary mt-2">
        На главную
      </Link>
    </main>
  );
}
