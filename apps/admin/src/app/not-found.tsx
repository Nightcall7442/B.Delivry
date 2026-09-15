import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="font-display text-2xl font-extrabold">Такой страницы нет</h1>
      <Link href="/orders" className="btn-secondary mt-6">
        К заказам
      </Link>
    </main>
  );
}
