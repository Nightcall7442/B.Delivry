/** The two public promises, in the customer's language. */
'use client';

import { GUARANTEE } from '@bazar/constants';
import { createT } from '@bazar/i18n';

import { GoShell } from '@/components/go/go-shell';

export function RulesScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  return (
    <GoShell
      locale={locale}
      back="history"
      peek={0.6}
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('rules.title')}</h1>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">{t('rules.intro')}</p>
      <section className="mt-4 rounded-2xl bg-sand-50 p-4">
        <h2 className="font-display text-base font-bold">🥬 {t('rules.freshness.title')}</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          {t('rules.freshness.body', { hours: GUARANTEE.FRESHNESS_WINDOW_HOURS })}
        </p>
      </section>
      <section className="mt-3 rounded-2xl bg-sand-50 p-4">
        <h2 className="font-display text-base font-bold">⏱ {t('rules.late.title')}</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          {t('rules.late.body', { minutes: GUARANTEE.LATE_TOLERANCE_MINUTES })}
        </p>
        <p className="mt-1.5 text-xs text-ink-muted">{t('rules.slot.hint')}</p>
      </section>
    </GoShell>
  );
}
