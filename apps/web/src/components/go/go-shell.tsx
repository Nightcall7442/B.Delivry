/**
 * Screen frame for the GO-style flow: map underneath, round buttons on top,
 * the sheet in front. Every customer screen is this with different sheet content.
 */
'use client';

import { UI_LOCALES, createT, type MessageKey } from '@bazar/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { BottomSheet, type BottomSheetProps } from '@/components/go/bottom-sheet';
import { ArrowLeft, Bag, Burger } from '@/components/go/icons';
import { MapView, type MapViewProps } from '@/components/map/map-view';
import { MarketShell } from '@/components/go/market-shell';
import { useAuth } from '@/features/auth';
import { useAppName } from '@/features/branding';
import { THEMES, useTheme } from '@/features/theme';
import { useCartCount } from '@/features/cart';
import { api } from '@/lib/api';

export interface GoShellProps extends Omit<BottomSheetProps, 'children'> {
  locale: string;
  /** Omitted = no map: the marketplace frame (header, column, tab bar). */
  map?: Omit<MapViewProps, 'inset'>;
  /** Where the top-left arrow goes; omitted = burger menu. */
  back?: string | 'history';
  children: ReactNode;
}

export function GoShell({ locale, map, back, peek = 0.46, children, ...sheet }: GoShellProps) {
  const t = createT(locale);
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const count = useCartCount();

  if (!map) {
    return (
      <MarketShell
        locale={locale}
        {...(back ? { back } : {})}
        header={sheet.header}
        footer={sheet.footer}
      >
        {children}
      </MarketShell>
    );
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-[#1e1408]">
      <MapView {...map} inset={peek} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:left-[440px]">
        {back ? (
          <button
            type="button"
            onClick={() => (back === 'history' ? router.back() : router.push(back))}
            className="go-fab pointer-events-auto"
            aria-label={t('common.back')}
          >
            <ArrowLeft />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="go-fab pointer-events-auto"
            aria-label={t('common.menu')}
          >
            <Burger />
          </button>
        )}

        <Link
          href={`/${locale}/cart`}
          className="go-fab pointer-events-auto relative"
          aria-label={t('cart.title')}
        >
          <Bag />
          {count > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-medium text-white">
              {count}
            </span>
          ) : null}
        </Link>
      </div>

      <BottomSheet peek={peek} locale={locale} {...sheet}>
        {children}
      </BottomSheet>

      {menu ? <Menu locale={locale} onClose={() => setMenu(false)} /> : null}
    </div>
  );
}

const MENU = [
  { href: '', key: 'menu.home' },
  { href: '/orders', key: 'menu.orders' },
  { href: '/list', key: 'menu.list' },
  { href: '/subscriptions', key: 'menu.subscriptions' },
  { href: '/business', key: 'menu.business' },
  { href: '/documents', key: 'menu.docs' },
  { href: '/neighbour', key: 'menu.neighbour' },
  { href: '/plus', key: 'menu.plus' },
  { href: '/invite', key: 'menu.invite' },
  { href: '/address', key: 'menu.address' },
  { href: '/catalog', key: 'menu.search' },
  { href: '/support', key: 'menu.support' },
  { href: '/rules', key: 'menu.rules' },
] as const satisfies ReadonlyArray<{ href: string; key: MessageKey }>;

export function Menu({ locale, onClose }: { locale: string; onClose: () => void }) {
  const t = createT(locale);
  const { user, ready, signOut } = useAuth();
  const appName = useAppName();
  const [theme, setTheme] = useTheme();
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-30 flex"
      role="dialog"
      aria-modal="true"
      aria-label={t('common.menu')}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <nav className="paper-sheet relative flex h-full w-[82%] max-w-xs flex-col p-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-pop">
        <p className="font-serif text-[28px] font-bold">
          {appName}
          <span className="text-brand-500">.</span>
        </p>
        <ul className="mt-6 flex flex-col">
          {MENU.map((item) => (
            <li key={item.href}>
              <Link
                href={`/${locale}${item.href}`}
                onClick={onClose}
                className="block py-3 text-lg"
              >
                {t(item.key)}
              </Link>
            </li>
          ))}
        </ul>
        {user ? (
          <button
            type="button"
            className="mt-2 block rounded-lg py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            onClick={() => {
              // The link is one-shot: fetch it fresh, then hand off to Telegram.
              const tab = window.open('', '_blank');
              void api()
                .notifications.telegramLink()
                .then(({ url }) => {
                  if (tab) tab.location.href = url;
                })
                .catch(() => tab?.close());
            }}
          >
            <span className="block text-lg">{t('menu.telegram')}</span>
            <span className="block text-xs text-ink-muted">
              {user.telegramLinked ? t('menu.telegramLinked') : t('menu.telegramHint')}
            </span>
          </button>
        ) : null}
        <div className="mt-auto border-t border-line pt-4 text-sm">
          {!ready ? null : user ? (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-ink-muted">{user.phone}</span>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2 py-1 text-ink-muted underline decoration-line-strong underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                onClick={() => {
                  onClose();
                  void signOut();
                }}
              >
                {t('common.signOut')}
              </button>
            </div>
          ) : (
            <Link href={`/${locale}/login`} onClick={onClose} className="btn-go-secondary h-12">
              {t('common.signIn')}
            </Link>
          )}
        </div>
        <div
          className="mt-4 flex items-center gap-2 text-sm"
          role="group"
          aria-label={t('theme.title')}
        >
          <span className="mr-1 text-ink-muted">{t('theme.title')}</span>
          {THEMES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTheme(option)}
              aria-pressed={option === theme}
              className="rounded-full bg-surface-mute px-3 py-1 font-medium text-ink-muted transition-colors aria-pressed:bg-brand-500 aria-pressed:text-white"
            >
              {t(`theme.${option}`)}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-4 text-sm uppercase">
          {UI_LOCALES.map((code) => (
            <Link
              key={code}
              href={`/${code}`}
              onClick={() => {
                // The API speaks the same language back: SMS, push, the Telegram bot.
                if (user)
                  void api()
                    .customers.updateUser({ locale: code })
                    .catch(() => undefined);
              }}
              className={code === locale ? 'font-medium text-brand-600' : 'text-ink-muted'}
            >
              {code}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
