/**
 * Cart subscriptions as the screens read them: which chips to show and how
 * to say "every Saturday by 8:00" in the customer's language.
 */
import { DELIVERY_SLOT_HOURS } from '@bazar/constants';
import { createT, type MessageKey } from '@bazar/i18n';

/** Monday first, the way a week is drawn here; values are JS weekdays. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const SLOT_HOURS = DELIVERY_SLOT_HOURS;

const two = (n: number) => String(n).padStart(2, '0');

export const slotTime = (hour: number): string => `${two(hour)}:00`;

/** "Каждую субботу к 08:00". */
export function subscriptionWhen(
  subscription: { weekday: number; hour: number },
  locale: string,
): string {
  const t = createT(locale);
  return t('subs.every', {
    day: t(`weekdayAcc.${subscription.weekday}` as MessageKey),
    time: slotTime(subscription.hour),
  });
}
