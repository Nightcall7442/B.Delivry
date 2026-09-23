/**
 * The frame for every secondary screen: the bazaar hall behind, the scene's
 * top row (back or wordmark, the address as a kraft tag, cart, menu), the
 * page title in cream serif, the content on one sheet of paper, and on phones
 * a glass tab bar. The map screens keep GoShell.
 */
'use client';

import { createT } from '@bazar/i18n';
import { addressLabel } from '@bazar/storefront';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Menu } from '@/components/go/go-shell';
import { ArrowLeft, Bag, Burger, Coin, Grid, HomeGlyph, Receipt } from '@/components/go/icons';
import { useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { useAppName } from '@/features/branding';
import { useCartCount } from '@/features/cart';
import { api } from '@/lib/api';

import bz from '@/components/bazar/bazar.module.css';

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
    <div className={bz.scene}>
      <div className={`${bz.body} ${bz.narrow}`} style={{ paddingBottom: 120 }}>
        <div className={bz.top}>
          <div className="flex min-w-0 items-center gap-3">
            {back ? (
              <button
                type="button"
                onClick={() => (back === 'history' ? router.back() : router.push(back))}
                className={bz.round}
                aria-label={t('common.back')}
              >
                <ArrowLeft />
              </button>
            ) : (
              <Link
                href={`/${locale}`}
                className="shrink-0 font-serif text-[26px] font-bold tracking-tight text-[#fbf1de]"
              >
                {appName}
                <span className="text-saffron-500">.</span>
              </Link>
            )}
            <Link href={`/${locale}/address`} className={`${bz.tag} min-w-0 truncate`}>
              {address ? addressLabel(address.text) : t('home.setAddress')}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {user && balance !== null && balance > 0 ? (
              <Link
                href={`/${locale}/plus`}
                className={`${bz.chip} ${bz.chipOn} hidden items-center gap-1.5 sm:inline-flex`}
              >
                <Coin size={16} />
                {t.qty(Math.floor(balance / 100))}
              </Link>
            ) : null}
            <Link href={`/${locale}/cart`} className={bz.round} aria-label={t('cart.title')}>
              <b className="relative">
                <Bag />
                {count > 0 ? <span className={bz.badge}>{count}</span> : null}
              </b>
            </Link>
            <button
              type="button"
              onClick={() => setMenu(true)}
              className={`${bz.round} ${bz.desktopOnly}`}
              aria-label={t('common.menu')}
            >
              <Burger />
            </button>
          </div>
        </div>

        <form
          className={`${bz.search} ${bz.desktopOnly}`}
          onSubmit={(event) => {
            event.preventDefault();
            const q = new FormData(event.currentTarget).get('q');
            router.push(`/${locale}/catalog${q ? `?q=${encodeURIComponent(String(q))}` : ''}`);
          }}
        >
          <input
            ref={search}
            name="q"
            type="search"
            placeholder={t('home.search')}
            autoComplete="off"
          />
        </form>

        {/* The page's title row comes in as `header`: it sits on the scene, in cream serif. */}
        {header ? (
          <div
            className={`${bz.greeting} [&_h1]:font-serif [&_h1]:text-[clamp(30px,4.6vw,44px)] [&_h1]:font-bold [&_h1]:leading-none [&_h1]:text-[#fbf1de] [&_p]:text-[#d9c7a6]`}
            style={{ minHeight: 0, padding: '14px 0 22px' }}
          >
            {header}
          </div>
        ) : null}

        <main className={bz.receipt}>
          {children}
          {footer ? <div className="mt-5">{footer}</div> : null}
        </main>
      </div>

      {/* Phones: the glass tab bar of the scene. */}
      <nav className={`${bz.bar} ${bz.phoneOnly}`}>
        <div
          className={`${bz.barInner} ${bz.glass} !h-16 !gap-0 !px-1`}
          style={{ justifyContent: 'space-around' }}
        >
          {tabs.map((tab) => {
            const active =
              tab.href === `/${locale}` ? pathname === tab.href : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-saffron-400' : 'text-[#d9c7a6]'}`}
              >
                {tab.icon}
                {tab.badge ? <span className={bz.badge}>{tab.badge}</span> : null}
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-[#d9c7a6]"
          >
            <Burger />
            {t('common.menu')}
          </button>
        </div>
      </nav>

      {menu ? <Menu locale={locale} onClose={() => setMenu(false)} /> : null}
    </div>
  );
}
