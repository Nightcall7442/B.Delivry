/**
 * Delivery windows. The morning slot is the product: goods bought at the
 * bazaar as it opens, at the door before breakfast. Three windows a day, no
 * arbitrary times — a stall cannot promise 13:47.
 */
import { createT } from '@bazar/i18n';

export interface DeliverySlot {
  /** `${day}-${startHour}`, stable across renders. */
  id: string;
  /** ISO start of the window, in the device's zone (Tashkent for our customers). */
  startsAt: string;
  day: 'today' | 'tomorrow';
  label: string;
}

const WINDOWS: readonly [number, number][] = [
  [8, 10],
  [12, 14],
  [18, 20],
];

/** A slot needs this much notice: the courier has to reach the bazaar first. */
const NOTICE_MINUTES = 90;

const two = (n: number) => String(n).padStart(2, '0');

export function deliverySlots(now: Date = new Date(), locale = 'ru'): DeliverySlot[] {
  const t = createT(locale);
  const slots: DeliverySlot[] = [];
  for (const day of ['today', 'tomorrow'] as const) {
    const base = new Date(now);
    if (day === 'tomorrow') base.setDate(base.getDate() + 1);
    for (const [from, to] of WINDOWS) {
      const startsAt = new Date(base);
      startsAt.setHours(from, 0, 0, 0);
      if (startsAt.getTime() - now.getTime() < NOTICE_MINUTES * 60_000) continue;
      slots.push({
        id: `${day}-${from}`,
        startsAt: startsAt.toISOString(),
        day,
        label: `${t(day === 'today' ? 'slots.today' : 'slots.tomorrow')} ${two(from)}:00–${two(to)}:00`,
      });
    }
  }
  return slots;
}

/** The label for an order's `scheduledFor`, matching the chip the customer tapped. */
export function slotLabel(scheduledFor: string, locale = 'ru', now: Date = new Date()): string {
  const t = createT(locale);
  const at = new Date(scheduledFor);
  const window = WINDOWS.find(([from]) => from === at.getHours());
  const time = window
    ? `${two(window[0])}:00–${two(window[1])}:00`
    : `${two(at.getHours())}:${two(at.getMinutes())}`;
  const sameDay = at.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = sameDay
    ? t('slots.today')
    : at.toDateString() === tomorrow.toDateString()
      ? t('slots.tomorrow')
      : t.date(at);
  return `${day} ${time}`;
}
