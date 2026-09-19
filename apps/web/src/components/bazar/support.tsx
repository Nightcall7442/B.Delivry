/**
 * Support: the hours in the vendor's hand, then one slip of paper with the
 * three ways in — a call, the Telegram bot for the signed-in, the rules.
 * Mirrors the app's support screen line for line.
 */
'use client';

import { createT } from '@bazar/i18n';
import Link from 'next/link';

import { ArrowLeft, Chat, Leaf, Phone } from '@/components/go/icons';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

import { isEvening } from './index';
import s from './bazar.module.css';

const PHONE = '+998 71 200 00 00';

export function BazaarSupport({ locale }: { locale: string }) {
  const t = createT(locale);
  const { user } = useAuth();
  const evening = isEvening();
  const home = `/${locale}`;
  const line = (icon: React.ReactNode, title: string, hint: string) => (
    <>
      <span className={s.payIcon}>{icon}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className={s.rcName} style={{ fontSize: 18 }}>
          {title}
        </span>
        <span className={s.rcUnit}>{hint}</span>
      </span>
      <span className={s.checkoutArrow} style={{ color: 'var(--pomegranate)' }}>
        →
      </span>
    </>
  );

  return (
    <main className={s.scene}>
      <div
        className={`${s.photo} ${s.photoDim} ${evening ? s.photoEvening : ''}`}
        style={{ backgroundImage: `url(/scenes/${evening ? 'evening' : 'morning'}.jpg)` }}
      />
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
        </div>
        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 26px' }}>
          <h1 className={s.display} style={{ fontSize: 'clamp(30px, 4.6vw, 48px)' }}>
            {t('support.title')}
          </h1>
          <p
            className={s.hand}
            style={{
              fontSize: 22,
              margin: '8px 0 0',
              color: 'var(--cream-muted)',
              maxWidth: '44ch',
            }}
          >
            {t('support.hours')}
          </p>
        </div>

        <section className={s.receipt}>
          <ul className={s.rcLines}>
            <li>
              <a href="tel:+998712000000" className={s.payRow}>
                {line(<Phone />, t('support.callTitle'), PHONE)}
              </a>
            </li>
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
                  {line(
                    <Chat />,
                    t('support.telegramTitle'),
                    user.telegramLinked ? t('menu.telegramLinked') : t('menu.telegramHint'),
                  )}
                </button>
              </li>
            ) : null}
            <li>
              <Link href={`${home}/rules`} className={s.payRow}>
                {line(<Leaf />, t('support.rulesTitle'), t('support.rulesHint'))}
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}

/** 404 on the scene: the same words the app uses, one way back. */
export function BazaarNotFound({ locale }: { locale: string }) {
  const t = createT(locale);
  const home = `/${locale}`;
  return (
    <main className={s.scene}>
      <div
        className={`${s.photo} ${s.photoDim}`}
        style={{ backgroundImage: 'url(/scenes/morning.jpg)' }}
      />
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
        </div>
        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 26px' }}>
          <h1 className={s.display} style={{ fontSize: 'clamp(30px, 4.6vw, 48px)' }}>
            {t('notFound.title')}
          </h1>
          <p
            className={s.hand}
            style={{
              fontSize: 22,
              margin: '8px 0 0',
              color: 'var(--cream-muted)',
              maxWidth: '44ch',
            }}
          >
            {t('notFound.hint')}
          </p>
          <Link href={home} className={s.rcCta} style={{ marginTop: 20, display: 'inline-flex' }}>
            {t('common.home')} →
          </Link>
        </div>
      </div>
    </main>
  );
}
