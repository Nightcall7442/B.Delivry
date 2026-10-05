/**
 * «Стать продавцом»: a stall or a corner shop applies from the site, the way Go Bazar and Bazara
 * invite merchants in. The desk calls, agrees the place and the commission, and approves; from then
 * on the seller stocks the stall in Bazar Seller.
 */
'use client';

import { createT } from '@bazar/i18n';
import type { VendorApplicationDto, VendorLegalType } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

const LEGAL: VendorLegalType[] = ['UNREGISTERED', 'INDIVIDUAL_ENTREPRENEUR', 'LLC'];

export function SellerScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const { user, ready } = useAuth();
  const [application, setApplication] = useState<VendorApplicationDto | null | undefined>();
  const [stall, setStall] = useState('');
  const [name, setName] = useState('');
  const [legalType, setLegalType] = useState<VendorLegalType>('UNREGISTERED');
  const [inn, setInn] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPhone(user.phone);
    setName([user.firstName, user.lastName].filter(Boolean).join(' '));
    api()
      .vendors.application()
      .then(setApplication)
      .catch(() => setApplication(null));
  }, [user]);

  const registered = legalType !== 'UNREGISTERED';

  const apply = async () => {
    setError(null);
    setBusy(true);
    try {
      const vendor = await api().vendors.apply({
        displayName: stall.trim(),
        legalName: name.trim(),
        legalType,
        phone: phone.replace(/\s/g, ''),
        ...(registered ? { taxId: inn } : {}),
      });
      setApplication({
        id: vendor.id,
        status: vendor.status,
        displayName: vendor.displayName,
        createdAt: new Date().toISOString(),
      });
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GoShell locale={locale} back="history" expanded header={<h1>{t('seller.title')}</h1>}>
      <p className="mt-1 text-sm text-ink-muted">{t('seller.intro')}</p>
      <ul className="mt-3 grid list-none grid-cols-3 gap-2 p-0 text-sm font-semibold">
        {[t('seller.perkCounter'), t('seller.perkCourier'), t('seller.perkPayout')].map((perk) => (
          <li key={perk} className="rounded-paper bg-sand-50 p-3">
            {perk}
          </li>
        ))}
      </ul>
      {!ready ? null : !user ? (
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/seller`)}`}
          className="btn-go mt-4"
        >
          {t('common.signIn')}
        </Link>
      ) : application === undefined ? null : application !== null ? (
        <section className="mt-4 rounded-paper bg-sand-50 p-4 text-sm">
          <p className="font-medium">{application.displayName}</p>
          <p className="mt-1 text-ink-muted">
            {application.status === 'ACTIVE'
              ? t('seller.approved')
              : application.status === 'PENDING'
                ? t('seller.pending')
                : t('seller.declined')}
          </p>
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
            value={stall}
            onChange={(e) => setStall(e.target.value)}
            className="go-field h-12"
            placeholder={t('seller.stall')}
            required
            minLength={2}
            maxLength={120}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="go-field h-12"
            placeholder={t('seller.name')}
            required
            minLength={2}
            maxLength={200}
          />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('seller.title')}>
            {LEGAL.map((type) => (
              <button
                key={type}
                type="button"
                className="go-chip"
                aria-pressed={legalType === type}
                onClick={() => setLegalType(type)}
              >
                {t(`seller.legal.${type}`)}
              </button>
            ))}
          </div>
          {registered ? (
            <input
              value={inn}
              onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 9))}
              className="go-field h-12"
              placeholder={t('business.inn')}
              inputMode="numeric"
              required
              pattern="\d{9}"
            />
          ) : null}
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="go-field h-12"
            placeholder="+998 90 123 45 67"
            inputMode="tel"
            required
            pattern="\+998\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2}"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button type="submit" className="btn-go mt-1" disabled={busy}>
            {busy ? t('common.loading') : t('seller.apply')}
          </button>
        </form>
      )}
    </GoShell>
  );
}
