/**
 * "Ещё 45 000 сум — и доставка бесплатно": the cheapest AOV lever there is.
 * One line of copy and a thread of majolica tiles filling up.
 */
import { freeDeliveryProgress } from '@bazar/storefront';
import type { MoneyDto } from '@bazar/types';
import { createT } from '@bazar/i18n';

export function FreeDeliveryBar({
  subtotal,
  threshold,
  locale,
  className = '',
}: {
  subtotal: number;
  threshold?: MoneyDto | null;
  locale: string;
  className?: string;
}) {
  const t = createT(locale);
  const progress = freeDeliveryProgress(subtotal, threshold);
  if (!progress) return null;
  return (
    <div className={`rounded-xl bg-surface-raise px-3 py-2 ${className}`}>
      <p className="text-xs">
        {progress.reached ? (
          <span className="font-medium text-brand-700">{t('cart.freeReached')}</span>
        ) : (
          t('cart.freeMore', { amount: t.money(progress.remaining) })
        )}
      </p>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.ratio * 100)}
        aria-label={t('cart.freeAria')}
      >
        <div
          className={`h-full rounded-full transition-[width] ${progress.reached ? 'bg-brand-500' : 'bg-saffron-400'}`}
          style={{ width: `${Math.max(4, progress.ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}
