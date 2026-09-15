/**
 * "Your order is on its way" strip at the top of the home sheet — GO shows the
 * live ride there, we show the live order.
 */
'use client';

import { orderStatusText, tr } from '@bazar/storefront';
import { createT } from '@bazar/i18n';
import Link from 'next/link';

import { Chevron } from '@/components/go/icons';
import { useActiveOrder } from '@/features/orders';

export function OrderBanner({ locale }: { locale: string }) {
  const t = createT(locale);
  const order = useActiveOrder();
  if (!order) return null;
  const text = orderStatusText(locale)[order.status];
  const eta = order.etaAt
    ? Math.max(1, Math.ceil((Date.parse(order.etaAt) - Date.now()) / 60_000))
    : null;

  return (
    <Link
      href={`/${locale}/orders/${order.id}`}
      className="mt-3 flex items-center gap-3 rounded-2xl bg-brand-950 px-4 py-3 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
    >
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inline-flex h-full w-full rounded-full bg-brand-300 opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-300" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{text.title}</span>
        <span className="block truncate text-xs text-white/70">
          {tr(order.store.name, locale)}
          {eta ? ` · ${t('common.eta', { minutes: eta })}` : ''}
        </span>
      </span>
      <span className="text-white/70">
        <Chevron />
      </span>
    </Link>
  );
}
