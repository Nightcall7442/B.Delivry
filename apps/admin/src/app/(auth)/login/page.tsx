'use client';

import { isApiError } from '@bazar/api-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';

const ERROR_TEXT: Record<string, string> = {
  INVALID_OTP: 'Код не подошёл.',
  OTP_EXPIRED: 'Код устарел — запросите новый.',
  RATE_LIMITED: 'Слишком часто. Подождите минуту.',
  NETWORK: 'Нет связи с API.',
};

const normalize = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  return `+${digits.startsWith('998') ? digits : `998${digits}`}`;
};

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, isStaff, requestCode, verifyCode, signOut } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user && isStaff) router.replace(user.vendorId ? '/stores' : '/orders');
  }, [ready, user, isStaff, router]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        isApiError(cause) ? (ERROR_TEXT[cause.code] ?? cause.message) : 'Что-то пошло не так',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-950 p-6">
      <form
        className="card w-full max-w-sm p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            if (step === 'phone') {
              await requestCode(normalize(phone));
              setStep('code');
            } else {
              await verifyCode(normalize(phone), code.trim());
            }
          });
        }}
      >
        <h1 className="font-display text-2xl font-extrabold">Диспетчерская</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {step === 'phone'
            ? 'Вход по номеру сотрудника или продавца.'
            : `Код из SMS на ${normalize(phone)}`}
        </p>

        {user && !isStaff ? (
          <p className="mt-4 rounded-control bg-saffron-100 p-3 text-sm">
            {user.phone} — не сотрудник.{' '}
            <button type="button" className="underline" onClick={() => void signOut()}>
              Выйти
            </button>
          </p>
        ) : null}

        {step === 'phone' ? (
          <label className="mt-5 block text-sm">
            Телефон
            <input
              className="field mt-1"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+998 71 000 00 00"
              inputMode="tel"
              autoFocus
            />
          </label>
        ) : (
          <label className="mt-5 block text-sm">
            Код
            <input
              className="field mt-1 tracking-[0.3em]"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoFocus
            />
          </label>
        )}

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
          {busy ? 'Секунду…' : step === 'phone' ? 'Получить код' : 'Войти'}
        </button>
        {step === 'code' ? (
          <button
            type="button"
            className="mt-3 w-full text-sm text-ink-muted underline"
            onClick={() => setStep('phone')}
          >
            Другой номер
          </button>
        ) : null}
      </form>
    </main>
  );
}
