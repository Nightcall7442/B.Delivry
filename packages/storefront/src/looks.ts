/**
 * «Покажите товар» on the customer's side: where the customer's ask for one good stands, and how
 * long ago the stall's photo was taken. The API keeps the asks; this only reads them.
 */
import type { T } from '@bazar/i18n';
import type { ProductLookDto } from '@bazar/types';

/** The customer's latest ask for the good, or null when they have not asked today. */
export function latestLook(
  rows: readonly ProductLookDto[],
  productId: string,
): ProductLookDto | null {
  return (
    rows
      .filter((row) => row.productId === productId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
  );
}

/** «снято только что», «снято 12 мин назад», «снято 3 ч назад». */
export function takenAgo(t: T, takenAt: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(takenAt)) / 60_000));
  if (minutes < 1) return t('look.justNow');
  if (minutes < 60) return t('look.minutesAgo', { count: minutes });
  return t('look.hoursAgo', { count: Math.floor(minutes / 60) });
}
