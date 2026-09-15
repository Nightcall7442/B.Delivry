/** Bazar Plus: one screen, one price, three promises. */
'use client';

import { isApiError } from '@bazar/api-client';
import { PLUS } from '@bazar/constants';
import { createT } from '@bazar/i18n';
import { ONLINE_PROVIDERS, plusActive } from '@bazar/storefront';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { DEFAULT_POINT, useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

const PERKS = ['plus.perk1', 'plus.perk2', 'plus.perk3'] as const;

export function PlusScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { address } = useAddress();
  const { user, ready, refresh } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = plusActive(user);
  const price = t.money(PLUS.PRICE_MINOR);

  useEffect(() => {
    if (!user) return;
    api()
      .payments.balance()
      .then((wallet) => setBalance(wallet.amount))
      .catch(() => setBalance(0));
  }, [user]);

  // Coming back from Payme/Click lands here: re-read the profile once.
  useEffect(() => {
    if (user) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (method: 'BALANCE' | 'ONLINE', provider?: 'payme' | 'click') => {
    if (!user?.customerId) return;
    setBusy(true);
    setError(null);
    try {
      const payment = await api().payments.buyPlus(user.customerId, {
        method,
        ...(provider ? { provider } : {}),
        returnUrl: window.location.href,
      });
      if (payment.confirmationUrl) {
        window.location.assign(payment.confirmationUrl);
        return;
      }
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const until = user?.plusUntil ? t.date(user.plusUntil) : '';

  return (
    <GoShell
      locale={locale}
      back="history"
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">
          {t('plus.title')}
          <span className="text-saffron-500">.</span>
        </h1>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">{t('plus.tagline', { price })}</p>
      <ul className="mt-4 space-y-2 rounded-2xl bg-sand-50 p-4 text-sm">
        {PERKS.map((key) => (
          <li key={key}>✓ {t(key)}</li>
        ))}
      </ul>
      {active ? (
        <p className="mt-4 font-display text-base font-bold text-brand-700">
          {t('plus.activeUntil', { date: until })}
        </p>
      ) : null}
      {!ready ? null : !user ? (
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/plus`)}`}
          className="btn-go mt-4"
        >
          {t('common.signIn')}
        </Link>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs text-ink-muted">
            {active ? t('plus.extend', { price }) : t('plus.buy', { price })}
          </p>
          <div className="flex gap-2">
            {ONLINE_PROVIDERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="btn-go h-11 flex-1"
                disabled={busy}
                onClick={() => void buy('ONLINE', option.id)}
              >
                {option.title}
              </button>
            ))}
          </div>
          {balance !== null && balance >= PLUS.PRICE_MINOR ? (
            <button
              type="button"
              className="btn-go-secondary h-11"
              disabled={busy}
              onClick={() => void buy('BALANCE')}
            >
              {t('plus.fromBalance', { balance: t.money(balance) })}
            </button>
          ) : balance !== null ? (
            <p className="text-xs text-ink-muted">
              {t('plus.notEnough', { balance: t.money(balance) })}
            </p>
          ) : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      )}
    </GoShell>
  );
}
