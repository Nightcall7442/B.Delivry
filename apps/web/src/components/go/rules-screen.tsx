/**
 * «Гарантии и вопросы» on one page: the two public promises, when money comes back, and the
 * questions people ask. The entries are @bazar/storefront's, shared with the app.
 */
'use client';

import { Clock, Leaf } from '@/components/go/icons';
import { createT } from '@bazar/i18n';
import { FAQ, GUARANTEES, RETURNS, type HelpEntry } from '@bazar/storefront';

import { GoShell } from '@/components/go/go-shell';

const ICON = { freshness: Leaf, late: Clock } as const;
const HEADING =
  'flex items-center gap-2 font-serif text-[length:var(--fs-lead)] font-bold leading-6';

export function RulesScreen({ locale }: { locale: string }) {
  const t = createT(locale);
  const body = (entry: HelpEntry) => t(entry.body, entry.params);
  return (
    <GoShell locale={locale} back="history" peek={0.6} header={<h1>{t('rules.title')}</h1>}>
      <p className="mt-1 text-sm text-ink-muted">{t('rules.intro')}</p>

      <h2 className={`mt-6 ${HEADING}`}>{t('help.promises')}</h2>
      {GUARANTEES.map((entry) => {
        const Icon = ICON[entry.id as keyof typeof ICON];
        return (
          <section key={entry.id} className="mt-3 rounded-paper bg-sand-50 p-4">
            <h3 className={HEADING}>
              {Icon ? (
                <span className="text-brand-600">
                  <Icon size={20} />
                </span>
              ) : null}
              {t(entry.title)}
            </h3>
            <p className="mt-1.5 text-sm text-ink-muted">{body(entry)}</p>
            {entry.id === 'late' ? (
              <p className="mt-1.5 text-xs text-ink-muted">{t('rules.slot.hint')}</p>
            ) : null}
          </section>
        );
      })}

      <h2 className={`mt-8 ${HEADING}`}>{t('help.returns')}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t('help.returnsIntro')}</p>
      {RETURNS.map((entry) => (
        <section key={entry.id} className="mt-3 rounded-paper bg-sand-50 p-4">
          <h3 className={HEADING}>{t(entry.title)}</h3>
          <p className="mt-1.5 text-sm text-ink-muted">{body(entry)}</p>
        </section>
      ))}

      <h2 className={`mt-8 ${HEADING}`}>{t('help.faq')}</h2>
      <div className="mt-3 rounded-paper bg-sand-50 px-4">
        {FAQ.map((entry, i) => (
          <details key={entry.id} className={`group py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
            <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{t(entry.title)}</span>
              <span
                aria-hidden
                className="text-ink-muted transition-transform group-open:rotate-90"
              >
                ›
              </span>
            </summary>
            <p className="mt-2 text-sm text-ink-muted">{body(entry)}</p>
          </details>
        ))}
      </div>
    </GoShell>
  );
}
