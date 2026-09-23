/**
 * The regular's card: a kraft card with the name, the balance and the Plus
 * stamp, then the services and the rest as slips of paper. A guest sees the
 * card blank with a line to sign in.
 */
'use client';

import { UI_LOCALES, createT, type MessageKey } from '@bazar/i18n';
import { plusActive } from '@bazar/storefront';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ArrowLeft,
  Bag,
  Basket,
  Chat,
  Coin,
  HomeGlyph,
  Leaf,
  ListGlyph,
  Mic,
  Receipt,
  Repeat,
  Star,
} from '@/components/go/icons';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

import s from './bazar.module.css';

type Item = { key: MessageKey; href: string; icon: React.ReactNode };

const SERVICES: Item[] = [
  { key: 'menu.orders', href: '/orders', icon: <Receipt /> },
  { key: 'menu.subscriptions', href: '/subscriptions', icon: <Repeat /> },
  { key: 'menu.plus', href: '/plus', icon: <Star /> },
  { key: 'menu.list', href: '/list', icon: <Mic /> },
  { key: 'menu.invite', href: '/invite', icon: <Coin /> },
  { key: 'menu.business', href: '/business', icon: <Basket /> },
  { key: 'menu.docs', href: '/documents', icon: <ListGlyph /> },
  { key: 'menu.neighbour', href: '/neighbour', icon: <Bag /> },
];
const MORE: Item[] = [
  { key: 'menu.address', href: '/address', icon: <HomeGlyph /> },
  { key: 'menu.support', href: '/support', icon: <Chat /> },
  { key: 'menu.rules', href: '/rules', icon: <Leaf /> },
];

export function BazaarProfile({ locale }: { locale: string }) {
  const t = createT(locale);
  const router = useRouter();
  const { user, ready, signOut } = useAuth();
  const home = `/${locale}`;
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return setBalance(null);
    api()
      .payments.balance()
      .then((wallet) => setBalance(wallet.amount))
      .catch(() => undefined);
  }, [user]);
  const plus = user ? plusActive(user) : false;

  const row = (item: Item) => (
    <li key={item.key}>
      <Link href={`${home}${item.href}`} className={s.payRow}>
        <span className={s.payIcon}>{item.icon}</span>
        <span className={s.rcName} style={{ flex: 1, fontSize: 18 }}>
          {t(item.key)}
        </span>
        <span className={s.checkoutArrow} style={{ color: 'var(--pomegranate)' }}>
          →
        </span>
      </Link>
    </li>
  );

  return (
    <main className={s.scene}>
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{t('profile.title')}</span>
        </div>

        {/* The regular's card */}
        <div className={s.kraft} style={{ margin: '18px 0 22px', padding: '18px 20px 20px' }}>
          <div className={s.kraftEyebrow} style={{ textAlign: 'left' }}>
            {t('profile.regular')}
          </div>
          <div className={s.rcVendor} style={{ margin: '12px 0 0' }}>
            <span
              className={`${s.avatar} ${s.avatarSmall}`}
              style={{ width: 56, height: 56, fontSize: 26 }}
            >
              {user
                ? user.firstName
                  ? user.firstName.slice(0, 1).toUpperCase()
                  : user.phone.slice(-2)
                : '·'}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className={s.rcVendorName} style={{ fontSize: 26 }}>
                {!ready ? '' : user ? user.firstName || user.phone : t('profile.guest')}
              </span>
              <span className={s.rcVendorMeta}>
                {user
                  ? user.firstName
                    ? user.phone
                    : t('profile.regular')
                  : t('profile.guestHint')}
              </span>
            </span>
          </div>
          {user ? (
            <div className={s.chips} style={{ marginTop: 16 }}>
              {balance !== null ? (
                <Link
                  href={`${home}/plus`}
                  className={s.stamp}
                  style={{ margin: 0, textDecoration: 'none' }}
                >
                  {t('menu.balance')} · {t.money(balance)}
                </Link>
              ) : null}
              {plus ? (
                <span className={s.stamp} style={{ margin: 0, transform: 'rotate(2deg)' }}>
                  {t('plus.activeUntil', { date: t.date(user.plusUntil ?? '') })}
                </span>
              ) : null}
            </div>
          ) : ready ? (
            <Link
              href={`${home}/login?next=${encodeURIComponent(`${home}/profile`)}`}
              className={s.rcCta}
              style={{ marginTop: 16 }}
            >
              {t('common.signIn')} →
            </Link>
          ) : null}
        </div>

        <section className={s.receipt}>
          <div className={s.rcHead}>
            <span className={s.rcTitle}>{t('profile.services')}</span>
          </div>
          <ul className={s.rcLines}>{SERVICES.map(row)}</ul>
        </section>

        <section className={s.receipt}>
          <div className={s.rcHead}>
            <span className={s.rcTitle}>{t('profile.more')}</span>
          </div>
          <ul className={s.rcLines}>
            {MORE.map(row)}
            {user ? (
              <li>
                <button
                  type="button"
                  className={s.payRow}
                  onClick={() =>
                    void api()
                      .notifications.telegramLink()
                      .then(({ url }) => window.open(url, '_blank', 'noopener'))
                      .catch(() => undefined)
                  }
                >
                  <span className={s.payIcon}>
                    <Chat />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className={s.rcName} style={{ fontSize: 18 }}>
                      {t('menu.telegram')}
                    </span>
                    <span className={s.rcUnit}>
                      {user.telegramLinked ? t('menu.telegramLinked') : t('menu.telegramHint')}
                    </span>
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
          <div className={s.rcSection}>{t('menu.language')}</div>
          <div className={s.chips}>
            {UI_LOCALES.map((code) => (
              <Link
                key={code}
                href={`/${code}/profile`}
                className={`${s.chipPaper} ${code === locale ? s.chipPaperOn : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
                onClick={() => {
                  // The API speaks the same language back: SMS, push, the Telegram bot.
                  if (user)
                    void api()
                      .customers.updateUser({ locale: code })
                      .catch(() => undefined);
                }}
              >
                {code === 'ru' ? 'Русский' : "O'zbekcha"}
              </Link>
            ))}
          </div>
        </section>

        {user ? (
          <button
            type="button"
            className={s.rcLink}
            style={{ display: 'block', margin: '4px auto 0', color: 'var(--cream-muted)' }}
            onClick={() => void signOut().then(() => router.replace(home))}
          >
            {t('common.signOut')}
          </button>
        ) : null}
      </div>
    </main>
  );
}
