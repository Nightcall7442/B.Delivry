/** A wrong address in the cabinet: the same ground and card as the sign-in page. */
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-end justify-start p-8 sm:items-center sm:p-12">
      <div className="ground" style={{ backgroundImage: 'url(/scenes/morning.jpg)' }} />
      <div className="w-full max-w-md">
        <div className="hand text-[20px]" style={{ color: 'var(--cream-muted)' }}>
          Чорсу · Алайский · Фархадский
        </div>
        <h1
          className="font-display mt-1 text-[clamp(38px,6vw,64px)] font-bold leading-[1.05]"
          style={{ color: 'var(--cream)' }}
        >
          Такой страницы нет
        </h1>
        <p className="hand mt-2 text-[22px]" style={{ color: 'var(--cream-muted)' }}>
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
