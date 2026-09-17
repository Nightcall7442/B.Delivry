/**
 * Sign in by phone: number → six digits → done. Two states in one sheet; the
 * map behind it keeps the app's frame so login does not feel like leaving.
 */
'use client';

import { isApiError } from '@bazar/api-client';
import { createT, type MessageKey, type T } from '@bazar/i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useAuth } from '@/features/auth';

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

export function LoginScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { user, ready, requestCode, verifyCode } = useAuth();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [codeLength, setCodeLength] = useState(6);
  const codeInput = useRef<HTMLInputElement>(null);

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (ready && user) router.replace(next ?? `/${locale}`);
  }, [ready, user, next, locale, router]);

  useEffect(() => {
    if (retryIn <= 0) return;
    const timer = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryIn]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestCode(normalize(phone));
      setCodeLength(result.codeLength);
      setRetryIn(result.retryAfter);
      setStep('code');
      setTimeout(() => codeInput.current?.focus(), 50);
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
      router.replace(next ?? `/${locale}`);
    } catch (e) {
      setError(describe(t, e));
      setBusy(false);
    }
  };

  return (
    <GoShell
      locale={locale}
      back="history"
      peek={0.5}
      header={
        <>
          <h1 className="font-display text-[22px] font-extrabold leading-7">
            {step === 'phone' ? t('login.title') : t('login.code')}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {step === 'phone'
              ? t('login.hint')
              : t('login.sent', { count: codeLength, phone: normalize(phone) })}
          </p>
        </>
      }
      footer={
        step === 'phone' ? (
          <button
            type="button"
            className="btn-go"
            disabled={busy || phone.replace(/\D/g, '').length < 9}
            onClick={sendCode}
          >
            {busy ? t('login.sending') : t('login.getCode')}
          </button>
        ) : (
          <button
            type="button"
            className="btn-go"
            disabled={busy || code.length < codeLength}
            onClick={confirm}
          >
            {busy ? t('login.checking') : t('login.enter')}
          </button>
        )
      }
    >
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void (step === 'phone' ? sendCode() : confirm());
        }}
      >
        {step === 'phone' ? (
          <label className="go-field gap-2">
            <span className="text-ink-muted">+998</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              autoFocus
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="90 123 45 67"
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
        ) : (
          <>
            <input
              ref={codeInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={codeLength}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder={'•'.repeat(codeLength)}
              className="go-field font-display text-2xl font-extrabold tracking-[0.4em] placeholder:tracking-[0.4em]"
            />
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-ink-muted underline decoration-line-strong underline-offset-4"
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
                className="text-brand-700 disabled:text-ink-faint"
                disabled={retryIn > 0 || busy}
                onClick={sendCode}
              >
                {retryIn > 0 ? t('login.retryIn', { seconds: retryIn }) : t('login.resend')}
              </button>
            </div>
          </>
        )}
        {error ? (
          <p role="alert" className="mt-3 rounded-2xl bg-saffron-100 px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}
      </form>
      <p className="mt-6 text-xs text-ink-muted">{t('login.terms')}</p>
    </GoShell>
  );
}
