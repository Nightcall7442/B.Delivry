/**
 * Past orders as a stack of receipts on the evening counter: the stall on
 * each, the status in handwriting, the sum, the day. Open ones on top.
 */
'use client';

import { isTerminalOrderStatus } from '@bazar/constants';
import { createT } from '@bazar/i18n';
import { orderStatusText, tr } from '@bazar/storefront';
import Link from 'next/link';

import { ArrowLeft } from '@/components/go/icons';
import { useAuth } from '@/features/auth';
import { useOrderList } from '@/features/orders';

import s from './bazar.module.css';

export function BazaarOrders({ locale }: { locale: string }) {
  const t = createT(locale);
  const { user, ready: authReady } = useAuth();
  const { orders, ready } = useOrderList();
  const home = `/${locale}`;
  const status = orderStatusText(locale);
  const day = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });

  return (
    <main className={s.scene}>
      <div className={`${s.photo} ${s.photoDim} ${s.photoEvening}`} style={{ backgroundImage: 'url(/scenes/evening.jpg)' }} />
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label={t('common.back')}>
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{t('receipt.title')}</span>
        </div>
        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 26px' }}>
          <h1 className={s.display} style={{ fontSize: 'clamp(36px, 5vw, 56px)' }}>
            {t('orders.title')}
          </h1>
        </div>

        {!authReady || !ready ? null : !user ? (
          <section className={s.receipt}>
            <p className={s.rcEmpty}>{t('orders.signIn')}</p>
            <Link href={`${home}/login?next=${encodeURIComponent(`${home}/orders`)}`} className={s.rcCta} style={{ marginTop: 18 }}>
              {t('common.signIn')} →
            </Link>
          </section>
        ) : orders.length === 0 ? (
          <section className={s.receipt}>
            <p className={s.rcEmpty}>{t('orders.empty')}</p>
            <p className={s.rcHint}>{t('receipt.emptyLine')}</p>
            <Link href={home} className={s.rcCta} style={{ marginTop: 18 }}>
              {t('common.toStores')} →
            </Link>
          </section>
        ) : (
          orders.map((order, i) => {
            const done = isTerminalOrderStatus(order.status);
            return (
              <Link
                key={order.id}
                href={`${home}/orders/${order.id}`}
                className={`${s.receipt} ${s.slip} ${done ? s.slipDone : ''}`}
                style={{ transform: `rotate(${[-0.5, 0.4, -0.3, 0.6][i % 4]}deg)` }}
              >
                <div className={s.rcHead}>
                  <span className={s.rcTitle}>{t('order.number', { number: order.number ?? order.id.slice(0, 6) })}</span>
                  <span className={s.rcDate}>{day.format(new Date(order.placedAt))}</span>
                </div>
                <div className={s.slipBody}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className={s.rcVendorName}>{tr(order.store.name, locale)}</span>
                    <span className={`${s.rcHaggle} ${done ? s.rcUnit : ''}`} style={{ marginTop: 2 }}>
                      {status[order.status].title}
                      {done && order.status === 'DELIVERED' ? ` · ${t('orders.reorderHint')}` : ''}
                    </span>
                  </span>
                  <span className={s.rcSum}>{t.money(order.totals.total.amount)}</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
