'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from '@/features/auth';

const NAV = [
  { href: '/orders', label: 'Заказы' },
  { href: '/couriers', label: 'Курьеры' },
  { href: '/stores', label: 'Точки' },
  { href: '/companies', label: 'Компании' },
  { href: '/invoices', label: 'Счета' },
  { href: '/demand', label: 'Спрос' },
  { href: '/brand', label: 'Бренд' },
];
/** The vendor cabinet: their orders and their stalls, nothing about couriers. */
const VENDOR_NAV = [
  { href: '/stores', label: 'Мои точки' },
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

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-white p-4">
        <div className="font-display text-xl font-extrabold">
          bazar<span className="text-brand-500">.</span>
          <span className="ml-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
            {isVendor ? 'продавец' : 'desk'}
          </span>
        </div>
        <nav className="mt-6 flex flex-col gap-1">
          {(isVendor ? VENDOR_NAV : NAV).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link"
              aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4 text-sm">
          <div className="truncate text-ink-muted">{user.phone}</div>
          <button
            type="button"
            className="mt-1 text-ink-muted underline hover:text-ink"
            onClick={() => {
              void signOut().then(() => router.replace('/login'));
            }}
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
