/** B2B: a café or canteen applies with its company; an operator grants invoice credit. */
'use client';

import { createT } from '@bazar/i18n';
import type { CustomerDto } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { DEFAULT_POINT, useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

export function BusinessScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { address } = useAddress();
  const { user, ready } = useAuth();
  const [me, setMe] = useState<CustomerDto | null>(null);
  const [company, setCompany] = useState('');
  const [inn, setInn] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    api()
      .customers.me()
      .then((row) => {
        setMe(row);
        setCompany(row.companyName ?? '');
        setInn(row.companyInn ?? '');
      })
      .catch(() => undefined);
  }, [user]);

  const apply = async () => {
    setError(null);
    try {
      setMe(
        await api().customers.applyBusiness({
          companyName: company.trim(),
          companyInn: inn.trim(),
        }),
      );
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <GoShell
      locale={locale}
      back="history"
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('business.title')}</h1>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">{t('business.intro')}</p>
      {!ready ? null : !user ? (
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/business`)}`}
          className="btn-go mt-4"
        >
          {t('common.signIn')}
        </Link>
      ) : me?.businessApprovedAt ? (
        <section className="mt-4 rounded-2xl bg-brand-50 p-4 text-sm">
          <p className="font-medium">{me.companyName}</p>
          <p className="mt-1">
            {t('business.approved', { days: me.creditDays, limit: t.money(me.creditLimit) })}
          </p>
          <p className="mt-2 text-xs text-ink-muted">{t('business.dailyHint')}</p>
          <Link href={`/${locale}/documents`} className="mt-2 block text-brand-700 underline">
            {t('docs.title')}
          </Link>
        </section>
      ) : me?.businessAppliedAt ? (
        <section className="mt-4 rounded-2xl bg-sand-50 p-4 text-sm">
          <p className="font-medium">
            {me.companyName} · {t('invoice.inn', { inn: me.companyInn ?? '' })}
          </p>
          <p className="mt-1 text-ink-muted">{t('business.pending')}</p>
        </section>
      ) : (
        <form
          className="mt-4 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="go-field h-12"
            placeholder={t('business.company')}
            required
            minLength={2}
          />
          <input
            value={inn}
            onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 9))}
            className="go-field h-12"
            placeholder={t('business.inn')}
            inputMode="numeric"
            required
            pattern="\d{9}"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button type="submit" className="btn-go mt-1">
            {t('business.apply')}
          </button>
        </form>
      )}
    </GoShell>
  );
}
