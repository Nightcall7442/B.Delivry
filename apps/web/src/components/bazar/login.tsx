/**
 * Sign in as a scene: the rows behind, the greeting, and the form on a paper
 * slip — number → six digits → done. No passwords. The logic is the old
 * screen's.
 */
'use client';

import { isApiError } from '@bazar/api-client';
import { createT, type MessageKey, type T } from '@bazar/i18n';
import type { OtpChannel } from '@bazar/types';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { ArrowLeft } from '@/components/go/icons';
import { useAuth } from '@/features/auth';

import { isEvening } from './index';
import s from './bazar.module.css';

const KNOWN_ERRORS = [
  'INVALID_OTP',
  'OTP_EXPIRED',
  'OTP_ATTEMPTS_EXCEEDED',
  'OTP_COOLDOWN',
  'RATE_LIMITED',
  'ACCOUNT_BLOCKED',
  'NETWORK',
  'VALIDATION',
];

const describe = (t: T, error: unknown): string =>
  isApiError(error)
    ? KNOWN_ERRORS.includes(error.code)
      ? t(`login.error.${error.code}` as MessageKey)
      : error.message
    : t('login.error.default');

/** "90 123 45 67" and "+998901234567" both become +998901234567. */
const normalize = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  return `+${digits.startsWith('998') ? digits : `998${digits}`}`;
};

export function BazaarLogin({ locale }: { locale: string }) {
  const t = createT(locale);
  const router = useRouter();
  // `next` must stay on this site: a relative path, never `//evil` or a full URL.
  const raw = useSearchParams().get('next');
  const next = raw && raw.startsWith('/') && !['/', '\\'].includes(raw.charAt(1)) ? raw : null;
  const { user, ready, requestCode, verifyCode, startTelegramLogin, telegramLogin } = useAuth();
  const evening = isEvening();
  const home = `/${locale}`;

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'telegram'>('phone');
  const [channel, setChannel] = useState<OtpChannel>('sms');
  const [ticket, setTicket] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [codeLength, setCodeLength] = useState(6);
  const codeInput = useRef<HTMLInputElement>(null);

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (ready && user) router.replace(next ?? home);
  }, [ready, user, next, home, router]);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(() => setRetryIn((v) => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  // While the person is in the bot, ask every two seconds whether it signed them in.
  useEffect(() => {
    if (ticket === null) return;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const signed = await telegramLogin(ticket);
        if (signed && !stopped) {
          stopped = true;
          router.replace(next ?? home);
        }
      } catch {
        if (!stopped) {
          stopped = true;
          setTicket(null);
          setStep('phone');
          setError(t('login.telegramExpired'));
        }
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    const onFocus = () => void poll();
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [ticket, telegramLogin, router, next, home, t]);

  const sendCode = async (force?: OtpChannel) => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestCode(normalize(phone), force);
      setCodeLength(result.codeLength);
      setRetryIn(result.retryAfter);
      setChannel(result.channel);
      setStep('code');
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (e) {
      setError(describe(t, e));
    } finally {
      setBusy(false);
    }
  };

  const viaTelegram = async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await startTelegramLogin();
      setTicket(started.code);
      setStep('telegram');
      window.open(started.url, '_blank', 'noopener');
    } catch (e) {
      setError(describe(t, e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyCode(normalize(phone), code);
      router.replace(next ?? home);
    } catch (e) {
      setError(describe(t, e));
      setBusy(false);
    }
  };

  const canSend = !busy && phone.replace(/\D/g, '').length >= 9;
  const canEnter = !busy && code.length >= codeLength;

  return (
    <main className={s.scene}>
      <div
        className={`${s.photo} ${evening ? s.photoEvening : ''}`}
        style={{ backgroundImage: `url(/scenes/${evening ? 'evening' : 'morning'}.jpg)` }}
      />
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{t('login.tagline')}</span>
        </div>
        <div className={s.greeting} style={{ minHeight: '26vh', padding: '12px 0 22px' }}>
          <div className={s.eyebrow}>{t('login.taglineHint')}</div>
          <h1
            className={`${s.display} ${evening ? s.displayEvening : ''}`}
            style={{ fontSize: 'clamp(38px, 6vw, 64px)' }}
          >
            {t(evening ? 'scene.evening' : 'scene.morning')}
          </h1>
          <p
            className={s.hand}
            style={{ fontSize: 24, margin: '6px 0 0', color: 'var(--cream-muted)' }}
          >
            {t('login.hint')}
          </p>
        </div>

        <form
          className={s.receipt}
          onSubmit={(event) => {
            event.preventDefault();
            void (step === 'phone' ? sendCode() : step === 'code' ? confirm() : undefined);
          }}
        >
          <div className={s.rcHead}>
            <span className={s.rcTitle}>
              {step === 'phone'
                ? t('login.title')
                : step === 'telegram'
                  ? t('login.viaTelegram')
                  : channel === 'telegram'
                    ? t('login.codeTelegram')
                    : t('login.code')}
            </span>
          </div>
          {step === 'phone' ? (
            <label className={s.phone}>
              <span>+998</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                autoFocus
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="90 123 45 67"
              />
            </label>
          ) : step === 'telegram' ? (
            <>
              <p className={s.rcHint}>{t('login.telegramWait')}</p>
              <div className={s.rcActions} style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={s.rcLink}
                  onClick={() => {
                    setTicket(null);
                    setStep('phone');
                  }}
                >
                  {t('login.sendSms')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={s.rcHint}>
                {channel === 'telegram'
                  ? t('login.sentTelegram', { count: codeLength })
                  : t('login.sent', { count: codeLength, phone: normalize(phone) })}
              </p>
              <input
                ref={codeInput}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={codeLength}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                placeholder={'•'.repeat(codeLength)}
                className={`${s.field} ${s.codeField}`}
              />
              <div className={s.rcActions} style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={s.rcLink}
                  style={{ color: '#7a6749' }}
                  onClick={() => {
                    setStep('phone');
                    setCode('');
                    setError(null);
                  }}
                >
                  {t('login.otherPhone')}
                </button>
                <button
                  type="button"
                  className={s.rcLink}
                  disabled={retryIn > 0 || busy}
                  onClick={() => void sendCode(channel === 'telegram' ? 'sms' : undefined)}
                >
                  {retryIn > 0
                    ? t('login.retryIn', { seconds: retryIn })
                    : channel === 'telegram'
                      ? t('login.sendSms')
                      : t('login.resend')}
                </button>
              </div>
            </>
          )}
          {error ? (
            <p role="alert" className={`${s.rcHint} ${s.rcWarn}`}>
              {error}
            </p>
          ) : null}
          {step !== 'telegram' ? (
            <div className={s.rcActions}>
              <button
                type="submit"
                className={s.rcCta}
                disabled={step === 'phone' ? !canSend : !canEnter}
                style={{
                  opacity: (step === 'phone' ? canSend : canEnter) ? 1 : 0.55,
                  width: '100%',
                }}
              >
                {step === 'phone'
                  ? busy
                    ? t('login.sending')
                    : t('login.getCode')
                  : busy
                    ? t('login.checking')
                    : t('login.enter')}
              </button>
            </div>
          ) : null}
          {step === 'phone' ? (
            <div className={s.rcActions} style={{ marginTop: 8 }}>
              <button
                type="button"
                className={s.rcCta}
                disabled={busy}
                onClick={() => void viaTelegram()}
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: 'var(--pomegranate)',
                  border: '1.5px solid var(--pomegranate)',
                }}
              >
                {t('login.viaTelegram')}
              </button>
            </div>
          ) : null}
          <p className={s.rcHint}>
            {t('login.terms')}{' '}
            <Link href={`${home}/offer`} className={s.rcLink}>
              Оферта
            </Link>{' '}
            ·{' '}
            <Link href={`${home}/privacy`} className={s.rcLink}>
              Политика
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
