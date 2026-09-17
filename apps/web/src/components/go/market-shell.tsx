/**
 * The marketplace frame: a sticky white header (logo · address · search ·
 * bonuses · cart · menu), one content column, a bottom tab bar on phones.
 * Every screen without a map is one of these — the map stays for picking an
 * address and tracking a courier.
 */
'use client';

import { createT } from '@bazar/i18n';
import { addressLabel } from '@bazar/storefront';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Menu } from '@/components/go/go-shell';
import {
  ArrowLeft,
  Bag,
  Burger,
  Coin,
  Grid,
  HomeGlyph,
  Receipt,
  Search,
} from '@/components/go/icons';
import { useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { useAppName } from '@/features/branding';
import { useCartCount } from '@/features/cart';
import { api } from '@/lib/api';

export function MarketShell({
  locale,
  back,
  header,
  footer,
  children,
}: {
  locale: string;
  back?: string | 'history';
  /** The page's own title row, under the site header. */
  header?: ReactNode;
  /** Pinned under the content on phones (the primary button), inline on desktop. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = createT(locale);
  // `/` jumps to the search unless the person is already typing somewhere.
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== '/') return;
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]'))
        return;
      event.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  const appName = useAppName();
  const count = useCartCount();
  const { address } = useAddress();
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return setBalance(null);
    api()
      .payments.balance()
      .then((wallet) => setBalance(wallet.amount))
      .catch(() => undefined);
  }, [user]);

  const tabs = [
    { href: `/${locale}`, icon: <HomeGlyph />, label: t('menu.home') },
    { href: `/${locale}/catalog`, icon: <Grid />, label: t('categories.title') },
    { href: `/${locale}/cart`, icon: <Bag />, label: t('cart.title'), badge: count },
    { href: `/${locale}/orders`, icon: <Receipt />, label: t('menu.orders') },
  ];

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="container-site flex h-16 items-center gap-3">
          {back ? (
            <button
              type="button"
              onClick={() => (back === 'history' ? router.back() : router.push(back))}
              className="go-fab shrink-0"
              aria-label={t('common.back')}
            >
              <ArrowLeft />
            </button>
          ) : null}
          <Link
            href={`/${locale}`}
            className="hidden shrink-0 font-serif text-[26px] font-bold tracking-tight text-ink md:block"
          >
            {appName}
            <span className="text-saffron-500">.</span>
          </Link>
          <Link
            href={`/${locale}/address`}
            className="flex min-w-0 shrink items-center gap-2 rounded-2xl bg-surface-mute px-3 py-2 text-sm md:max-w-[260px]"
          >
            <span className="text-brand-600">
              <HomeGlyph />
            </span>
            <span className="min-w-0 truncate font-medium">
              {address ? addressLabel(address.text) : t('home.setAddress')}
            </span>
          </Link>
          <form
            className="hidden min-w-0 flex-1 md:block"
            onSubmit={(event) => {
              event.preventDefault();
              const q = new FormData(event.currentTarget).get('q');
              router.push(`/${locale}/catalog${q ? `?q=${encodeURIComponent(String(q))}` : ''}`);
            }}
          >
            <label className="flex h-11 items-center gap-3 rounded-2xl bg-surface-mute px-4 text-ink-faint">
              <Search />
              <input
                ref={search}
                name="q"
                type="search"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint"
                placeholder={t('home.search')}
                autoComplete="off"
              />
              <kbd className="rounded-md bg-surface-raise px-1.5 text-[11px] font-semibold text-ink-faint">
                /
              </kbd>
            </label>
          </form>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {user && balance !== null && balance > 0 ? (
              <Link
                href={`/${locale}/plus`}
                className="flex h-10 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-sm font-bold text-brand-700"
              >
                <Coin size={16} />
                {t.qty(Math.floor(balance / 100))}
              </Link>
            ) : null}
            <Link href={`/${locale}/cart`} className="go-fab relative" aria-label={t('cart.title')}>
              <Bag />
              {count > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-white">
                  {count}
                </span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="go-fab hidden md:flex"
              aria-label={t('common.menu')}
            >
              <Burger />
            </button>
          </div>
        </div>
      </header>

      <main className="container-site pb-28 pt-4 md:pb-16">
        {header ? <div className="mb-4">{header}</div> : null}
        {children}
        {footer ? (
          <div className="fixed inset-x-0 bottom-16 z-10 bg-gradient-to-t from-surface via-surface/95 to-surface/0 px-4 pb-3 pt-6 md:static md:mt-6 md:bg-none md:p-0">
            <div className="mx-auto max-w-md md:mx-0">{footer}</div>
          </div>
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-stretch border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabs.map((tab) => {
          const active =
            tab.href === `/${locale}` ? pathname === tab.href : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-brand-600' : 'text-ink-muted'}`}
            >
              {tab.icon}
              {tab.badge ? (
                <span className="absolute right-[calc(50%-20px)] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {tab.badge}
                </span>
              ) : null}
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenu(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-muted"
        >
          <Burger />
          {t('common.menu')}
        </button>
      </nav>

      {menu ? <Menu locale={locale} onClose={() => setMenu(false)} /> : null}
    </div>
  );
}
