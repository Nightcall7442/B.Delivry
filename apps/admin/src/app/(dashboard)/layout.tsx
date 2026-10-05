'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/features/auth';

const NAV = [
  { href: '/orders', label: 'Заказы' },
  { href: '/couriers', label: 'Курьеры' },
  { href: '/stores', label: 'Точки' },
  { href: '/vendors', label: 'Продавцы' },
  { href: '/companies', label: 'Компании' },
  { href: '/invoices', label: 'Счета' },
  { href: '/demand', label: 'Спрос' },
  { href: '/brand', label: 'Бренд' },
  { href: '/settings', label: 'Настройки' },
];
/** The vendor cabinet: their orders and their stalls, nothing about couriers. */
const VENDOR_NAV = [
  { href: '/stores', label: 'Мои прилавки' },
  { href: '/orders', label: 'Заказы' },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, isStaff, isVendor, signOut } = useAuth();

  useEffect(() => {
    if (ready && (!user || !isStaff)) router.replace('/login');
  }, [ready, user, isStaff, router]);

  if (!ready || !user || !isStaff) return null;

  const nav = (isVendor ? VENDOR_NAV : NAV).map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className="nav-link shrink-0"
      aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
    >
      {item.label}
    </Link>
  ));
  const signOutButton = (
    <button
      type="button"
      className="text-sm font-bold underline decoration-dotted underline-offset-4"
      onClick={() => {
        void signOut().then(() => router.replace('/login'));
      }}
    >
      Выйти
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="ground" />

      {/* Phones and tablets: a strip of glass over the ground, the labels scroll sideways. */}
      <header
        className="glass sticky top-0 z-10 flex items-center gap-3 border-x-0 border-t-0 px-4 py-3 md:hidden"
        style={{ color: 'var(--cream)' }}
      >
        <div className="font-display shrink-0 text-title font-bold">
          Bazar<span style={{ color: 'var(--ochre)' }}>.</span>
        </div>
        <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav}
        </nav>
        <div className="shrink-0">{signOutButton}</div>
      </header>

      {/* Laptops: a sheet of kraft along the left, the plan of the rows, lifted off the ground. */}
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col p-5 shadow-paper md:flex"
        style={{ background: 'var(--kraft)' }}
      >
        <div className="font-display text-headline font-bold">
          Bazar<span style={{ color: 'var(--ochre)' }}>.</span>
        </div>
        <div className="font-display mt-1 text-lead italic text-ink-muted">
          {isVendor ? 'за прилавком' : 'диспетчерская'}
        </div>
        <nav className="mt-7 flex flex-col gap-2">{nav}</nav>
        <div
          className="mt-auto pt-4"
          style={{
            borderTop: '1.5px dashed color-mix(in srgb, var(--ink-paper) 35%, transparent)',
          }}
        >
          <div className="truncate text-sm font-bold tabular-nums">{user.phone}</div>
          <div className="mt-1">{signOutButton}</div>
        </div>
      </aside>

      <main className="on-ground min-w-0 flex-1 p-4 text-[var(--cream)] sm:p-6 lg:p-8 [&_h1+p]:text-[var(--cream-muted)] [&_h1]:font-bold [&_h1]:text-[var(--cream)]">
        {children}
      </main>
    </div>
  );
}
