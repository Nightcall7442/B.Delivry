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
  { href: '/stores', label: 'Мои прилавки' },
  { href: '/orders', label: 'Заказы' },
];

/** Tashkent hour: the bazaar lives on its own clock, not the visitor's. */
const isEvening = () => {
  const hour = (new Date().getUTCHours() + 5) % 24;
  return hour >= 17 || hour < 5;
};

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
      className="hand text-[17px] underline decoration-dotted underline-offset-4"
      style={{ color: 'var(--pomegranate)' }}
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

      {/* Phones and tablets: a strip of kraft across the top, the signs scroll sideways. */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 md:hidden"
        style={{ background: 'var(--kraft)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}
      >
        <div className="font-display shrink-0 text-[24px] font-bold leading-none">
          Bazar<span style={{ color: 'var(--saffron)' }}>.</span>
        </div>
        <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav}
        </nav>
        <div className="shrink-0">{signOutButton}</div>
      </header>

      {/* Laptops: a sheet of kraft pinned along the left. */}
      <aside
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col p-5 md:flex"
        style={{ background: 'var(--kraft)', boxShadow: '8px 0 30px rgba(0,0,0,0.35)' }}
      >
        <div className="font-display text-[30px] font-bold leading-none">
          Bazar<span style={{ color: 'var(--saffron)' }}>.</span>
        </div>
        <div className="hand mt-1 text-[19px] text-ink-muted">
          {isVendor ? 'за прилавком' : 'диспетчерская'}
        </div>
        <nav className="mt-7 flex flex-col gap-2">{nav}</nav>
        <div className="mt-auto pt-4" style={{ borderTop: '1.5px dashed rgba(43,27,14,0.35)' }}>
          <div className="hand truncate text-[18px]">{user.phone}</div>
          <div className="mt-1">{signOutButton}</div>
        </div>
      </aside>

      <main className="on-ground min-w-0 flex-1 p-4 text-[#fbf1de] sm:p-6 lg:p-8 [&_h1+p]:text-[#d9c7a6] [&_h1]:text-[clamp(30px,4vw,44px)] [&_h1]:font-bold [&_h1]:leading-none [&_h1]:text-[#fbf1de]">
        {children}
      </main>
    </div>
  );
}
