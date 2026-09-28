/** A wrong address in the cabinet: the hall and the same card as the sign-in page. */
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="hall flex min-h-screen items-end justify-start p-8 sm:items-center sm:p-12">
      <div className="w-full max-w-md">
        <div className="eyebrow">Чорсу · Алайский · Фархадский</div>
        <h1 className="font-display mt-1 text-display font-bold" style={{ color: 'var(--cream)' }}>
          Такой страницы нет
        </h1>
        <p className="font-display mt-2 text-lead italic" style={{ color: 'var(--cream-muted)' }}>
          Ссылка устарела или набрана с ошибкой.
        </p>
        <div className="card mt-6 w-full p-6">
          <Link href="/orders" className="btn-primary inline-flex">
            К заказам →
          </Link>
        </div>
      </div>
    </main>
  );
}
