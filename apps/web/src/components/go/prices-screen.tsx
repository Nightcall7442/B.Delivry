/**
 * «Цены базара» — the «Индекс базара» of a city: what the staples cost in the rows today, the move
 * since last week, the shops beside them and the line of eight weeks. The figures are the API's;
 * the screen only says them.
 */
'use client';

import { createT, type T } from '@bazar/i18n';
import { changeText, sparkPath, tr, trendOf } from '@bazar/storefront';
import type { PriceIndexDto } from '@bazar/types';
import Link from 'next/link';

import { ShareButton } from '@/components/bazar';
import { GoShell } from '@/components/go/go-shell';

const HEADING =
  'flex items-center gap-2 font-serif text-[length:var(--fs-lead)] font-bold leading-6';
const TONE = { up: 'text-danger', down: 'text-ink', flat: 'text-ink-muted' } as const;
const ARROW = { up: '▲ ', down: '▼ ', flat: '' } as const;

/** The day and time in Tashkent, the same on the server and in any browser. */
function asOfParts(t: T, iso: string): { date: string; time: string } {
  const at = new Date(iso);
  const zone = { timeZone: 'Asia/Tashkent' } as const;
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    ...zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(at)
    .split('-')
    .map(Number);
  const time = new Intl.DateTimeFormat('ru-RU', {
    ...zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  return { date: t.date(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)), time };
}

// A phone narrower than 420 px gives the row's words the room: the arrow and the percent beside
// the price already say which way it went.
function Spark({ weeks }: { weeks: (number | null)[] }) {
  const path = sparkPath(weeks, 48, 22, 3);
  if (path === null) return <span className="w-12 shrink-0 max-[419px]:hidden" aria-hidden />;
  return (
    <svg
      width={48}
      height={22}
      viewBox="0 0 48 22"
      aria-hidden
      className="shrink-0 text-ink-muted max-[419px]:hidden"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function PricesScreen({ locale, index }: { locale: string; index: PriceIndexDto | null }) {
  const t = createT(locale);
  const city = index?.city ? tr(index.city.name, locale) : '';
  const money = (amount: number) => t.money(amount, index?.currency);
  const { date, time } = index ? asOfParts(t, index.asOf) : { date: '', time: '' };
  const cheaper = index?.cheaperThanShopsPercent ?? null;
  const week = index?.weekChangePercent ?? null;

  return (
    <GoShell
      locale={locale}
      back="history"
      peek={0.6}
      header={
        <div className="flex items-center gap-3">
          <h1 className="flex-1">{t('prices.title')}</h1>
          {index?.city ? (
            <ShareButton
              text={t('prices.shareText', { city })}
              path={`/${locale}/prices?city=${index.city.id}`}
              t={t}
            />
          ) : null}
        </div>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">{t('prices.intro')}</p>
      {index?.city ? (
        <p className="mt-1 text-xs text-ink-faint">{t('prices.asOf', { city, date, time })}</p>
      ) : null}

      {index && index.cities.length > 1 ? (
        <nav className="mt-3 flex flex-wrap gap-2" aria-label={t('prices.title')}>
          {index.cities.map((place) => {
            const here = place.id === index.city?.id;
            return (
              <Link
                key={place.id}
                href={`/${locale}/prices?city=${place.id}`}
                aria-current={here ? 'page' : undefined}
                className={`rounded-full px-3 py-1 text-sm ${
                  here ? 'bg-ink text-surface' : 'bg-sand-50 text-ink'
                }`}
              >
                {tr(place.name, locale)}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!index || index.items.length === 0 ? (
        <p className="mt-6 rounded-paper bg-sand-50 p-4 text-sm text-ink-muted">
          {t('prices.empty')}
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {cheaper !== null ? (
              <section className="rounded-paper bg-sand-50 p-4">
                <p className="text-xs text-ink-muted">{t('prices.vsShops')}</p>
                <p className="mt-1 font-display text-[length:var(--fs-lead)] font-bold leading-6 text-ink">
                  {t(cheaper >= 0 ? 'prices.cheaper' : 'prices.dearer', {
                    percent: Math.abs(cheaper),
                  })}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{t('prices.vsShopsHint')}</p>
              </section>
            ) : null}
            <section className="rounded-paper bg-sand-50 p-4">
              <p className="text-xs text-ink-muted">{t('prices.week')}</p>
              <p
                className={`mt-1 font-display text-[length:var(--fs-title)] font-bold leading-7 ${TONE[trendOf(week)]}`}
              >
                {ARROW[trendOf(week)]}
                {changeText(t, week)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{t('prices.weekHint')}</p>
            </section>
          </div>

          <ul className="mt-5 rounded-paper bg-sand-50 px-4">
            {index.items.map((item, i) => {
              const trend = trendOf(item.changePercent);
              return (
                <li
                  key={item.key}
                  className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    {/* Wrapped, not cut: the shop's price and the unit are the point of the row. */}
                    <p className="font-serif text-[length:var(--fs-lead)] font-bold leading-6 text-ink">
                      {tr(item.title, locale)}{' '}
                      <span className="whitespace-nowrap font-sans text-xs font-normal text-ink-muted">
                        {t('prices.per', { per: tr(item.per, locale) })}
                      </span>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {item.min === item.max
                        ? t.n('prices.stalls', item.stalls)
                        : `${t.n('prices.stalls', item.stalls)} · ${t('prices.range', { min: money(item.min), max: money(item.max) })}`}
                    </p>
                    {item.shops !== null ? (
                      <p className="text-xs text-ink-muted">
                        {t('prices.shops', { price: money(item.shops) })}
                      </p>
                    ) : null}
                  </div>
                  <Spark weeks={item.weeks} />
                  <div className="min-w-[6.5rem] shrink-0 text-right">
                    <p className="whitespace-nowrap font-display font-bold text-ink">
                      {money(item.median)}
                    </p>
                    <p className={`whitespace-nowrap text-xs ${TONE[trend]}`}>
                      {ARROW[trend]}
                      {changeText(t, item.changePercent)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <h2 className={`mt-6 ${HEADING}`}>{t('prices.how')}</h2>
          <p className="mt-1.5 text-sm text-ink-muted">{t('prices.howBody')}</p>
          <p className="mt-1.5 text-xs text-ink-faint">{t('prices.trend')}</p>
        </>
      )}
    </GoShell>
  );
}
