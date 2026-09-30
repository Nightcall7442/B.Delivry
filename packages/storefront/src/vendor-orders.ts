import { isApiError } from '@bazar/api-client';
import {
  ORDER_STATUS,
  STORE_CANCELLABLE_STATUSES,
  WEIGHTED_UNITS,
  isTerminalOrderStatus,
} from '@bazar/constants';
import type { OrderStatus, ProductUnit, SubstitutionPolicy } from '@bazar/constants';
import { createT } from '@bazar/i18n';
import type { OrderDto, OrderItemDto } from '@bazar/types';

import { describeOrderError } from './checkout.js';
import { tr } from './i18n.js';
import { UNIT_LABEL } from './labels.js';
import { slotLabel } from './slots.js';
import { plural } from './text.js';

/** Where an order sits for the stall: waiting for its answer, being gathered and carried, or over. */
export type VendorPile = 'fresh' | 'working' | 'done';

export const vendorPileOf = (status: OrderStatus): VendorPile =>
  status === ORDER_STATUS.PENDING ? 'fresh' : isTerminalOrderStatus(status) ? 'done' : 'working';

/** The stall may accept only what still waits for it. */
export const canConfirm = (status: OrderStatus): boolean => status === ORDER_STATUS.PENDING;

/** …and decline only while the goods are still the stall's (the same window the customer has). */
export const canDecline = (status: OrderStatus): boolean =>
  STORE_CANCELLABLE_STATUSES.includes(status);

/** The three piles, newest first inside each. */
export function vendorPiles(orders: readonly OrderDto[]): Record<VendorPile, OrderDto[]> {
  const piles: Record<VendorPile, OrderDto[]> = { fresh: [], working: [], done: [] };
  for (const order of orders) piles[vendorPileOf(order.status)].push(order);
  for (const pile of Object.values(piles)) {
    pile.sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
  }
  return piles;
}

/**
 * Orders the stall has not been told about: still alive, placed recently, not yet acknowledged.
 * Oldest first, so the one that has waited longest rings first. An order older than `maxAgeMs` is
 * not announced: a stall that opens the app after lunch is not shouted at about the morning.
 */
export function unseenOrders(
  orders: readonly OrderDto[],
  seen: ReadonlySet<string>,
  now: number = Date.now(),
  maxAgeMs: number = 3 * 3600_000,
): OrderDto[] {
  return orders
    .filter(
      (order) =>
        !seen.has(order.id) &&
        !isTerminalOrderStatus(order.status) &&
        now - Date.parse(order.placedAt) <= maxAgeMs,
    )
    .sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
}

// ---- the Orders tab: piles, words, time ---------------------------------------------------------

/** The segments of the tab in the order they are laid out — and the order the default looks in. */
export const VENDOR_PILES: readonly VendorPile[] = ['fresh', 'working', 'done'];

export const VENDOR_PILE_LABEL: Record<VendorPile, string> = {
  fresh: 'Новые',
  working: 'В работе',
  done: 'Завершённые',
};

type PileSizes = Record<VendorPile, readonly unknown[]>;

/** Where the tab opens: on what waits for an answer, else on what is being carried, else the past. */
export const defaultPile = (piles: PileSizes): VendorPile =>
  VENDOR_PILES.find((pile) => piles[pile].length > 0) ?? 'fresh';

/** The stall's tap: the pile, and whether it had orders in it when they chose it. */
export interface PilePick {
  pile: VendorPile;
  filled: boolean;
}

export const pickPile = (pile: VendorPile, piles: PileSizes): PilePick => ({
  pile,
  filled: piles[pile].length > 0,
});

/**
 * What the tab shows. A pick sticks; one that ran dry under the stall's eyes (the last new order
 * was just answered) gives way to the default, which follows the orders. A pile opened empty stays
 * open: it was asked for.
 */
export function shownPile(pick: PilePick | null, piles: PileSizes): VendorPile {
  if (pick && (!pick.filled || piles[pick.pile].length > 0)) return pick.pile;
  return defaultPile(piles);
}

/** What the stall is told about an order at each status: the line, and what to do about it. */
const VENDOR_STATUS: Record<OrderStatus, { line: string; hint: string | null }> = {
  PENDING: { line: 'Ждёт вашего ответа', hint: 'Примите заказ, если всё есть на прилавке' },
  CONFIRMED: { line: 'Принят, собирайте', hint: 'Курьера мы вызовем сами' },
  SEARCHING_COURIER: { line: 'Ищем курьера', hint: 'Пока собирайте заказ' },
  COURIER_ASSIGNED: { line: 'Курьер едет к вам', hint: 'К его приходу заказ должен быть готов' },
  COURIER_ARRIVED_PICKUP: { line: 'Курьер у вас', hint: 'Отдайте ему заказ' },
  PICKING_UP: { line: 'Курьер забирает заказ', hint: 'Он взвешивает и проверяет товары' },
  PICKED_UP: { line: 'Забрали', hint: 'Заказ у курьера' },
  IN_DELIVERY: { line: 'В пути к клиенту', hint: null },
  COURIER_ARRIVED: { line: 'Курьер у клиента', hint: null },
  DELIVERED: { line: 'Доставлен', hint: null },
  CANCELLED: { line: 'Отменён', hint: null },
  FAILED: { line: 'Не доставлен', hint: 'Поддержка разбирается с заказом' },
  REFUNDED: { line: 'Возврат клиенту', hint: null },
};

export const vendorStatusText = (status: OrderStatus): string => VENDOR_STATUS[status].line;

export const vendorStatusHint = (status: OrderStatus): string | null => VENDOR_STATUS[status].hint;

/** The courier stands at the counter: the moment the stall has to hand the order over. */
export const courierAtStall = (status: OrderStatus): boolean =>
  status === ORDER_STATUS.COURIER_ARRIVED_PICKUP || status === ORDER_STATUS.PICKING_UP;

/** From the search on until the order is over there is a courier to tell the stall about. */
export const courierInPlay = (status: OrderStatus): boolean =>
  status !== ORDER_STATUS.PENDING &&
  status !== ORDER_STATUS.CONFIRMED &&
  !isTerminalOrderStatus(status);

const TASHKENT_MS = 5 * 3_600_000;
const DAY_MS = 86_400_000;
const two = (n: number) => String(n).padStart(2, '0');

/** Whole Tashkent days since the epoch: the day an instant falls in. */
const dayIndex = (ms: number): number => Math.floor((ms + TASHKENT_MS) / DAY_MS);

/** «HH:mm» on Tashkent's clock: the stall's hour, whatever zone the phone is in. */
export function orderClock(iso: string): string {
  const local = new Date(Date.parse(iso) + TASHKENT_MS);
  return `${two(local.getUTCHours())}:${two(local.getUTCMinutes())}`;
}

/** «сегодня, 14:05», «вчера, 21:40», then «28 сентября, 09:12» — with the year once it is not this one. */
export function placedLabel(iso: string, now: Date = new Date()): string {
  const day = dayIndex(Date.parse(iso));
  const today = dayIndex(now.getTime());
  const clock = orderClock(iso);
  if (day === today) return `сегодня, ${clock}`;
  if (day === today - 1) return `вчера, ${clock}`;
  // Noon UTC of that date is the same date on any phone from UTC−11 to UTC+11 (`t.date` reads the device's).
  const date = createT('ru').date(new Date(day * DAY_MS + DAY_MS / 2));
  const year = new Date(day * DAY_MS).getUTCFullYear();
  const sameYear = year === new Date(today * DAY_MS).getUTCFullYear();
  return `${sameYear ? date : `${date} ${year}`}, ${clock}`;
}

/** «Запланирован на завтра 08:00–10:00» for a slot order; null for «как можно скорее». */
export function scheduleHint(scheduledFor: string | null, now: Date = new Date()): string | null {
  if (scheduledFor === null) return null;
  const slot = slotLabel(scheduledFor, 'ru', now);
  return `Запланирован на ${slot.charAt(0).toLowerCase()}${slot.slice(1)}`;
}

/** «3 позиции» */
export const itemCountText = (count: number): string =>
  `${count} ${plural(count, 'позиция', 'позиции', 'позиций')}`;

/** The first names and how many more there are: «Помидоры, Огурцы и ещё 3». */
export function itemNamesText(items: readonly Pick<OrderItemDto, 'name'>[], shown = 2): string {
  const names = items.slice(0, shown).map((item) => tr(item.name, 'ru'));
  const rest = items.length - names.length;
  return rest > 0 ? `${names.join(', ')} и ещё ${rest}` : names.join(', ');
}

/** Weighed goods are priced on the scale at the stall, not on what the customer typed. */
export const isWeighed = (unit: ProductUnit): boolean => WEIGHTED_UNITS.includes(unit);

/** Until the scale has spoken, the goods total is the estimate of the quantities ordered. */
export const goodsEstimated = (order: Pick<OrderDto, 'status' | 'items'>): boolean =>
  !isTerminalOrderStatus(order.status) &&
  order.items.some((item) => isWeighed(item.unit) && item.actualQuantity === null);

/** «2 кг», «1,5 кг», «3 шт» */
export const itemQuantityText = (item: Pick<OrderItemDto, 'quantity' | 'unit'>): string =>
  `${createT('ru').qty(item.quantity)} ${UNIT_LABEL[item.unit]}`;

/** What the customer wants when something on the list is out — said to the stall, not to the courier. */
export const VENDOR_SUBSTITUTION_TEXT: Record<SubstitutionPolicy, string> = {
  CALL: 'Клиент просит сначала позвонить ему — скажите курьеру, не заменяйте сами',
  REPLACE: 'Можно заменить похожим, но не дороже',
  REMOVE: 'Просто уберите эту позицию из заказа',
};

/** The stall knows the customer by first name only: no surname, no phone, no street. */
export function customerFirstName(customer: { firstName: string | null } | null): string {
  return customer?.firstName?.trim().split(/\s+/)[0] || 'Клиент';
}

/**
 * When the customer gets the goods, once they have left the stall. Before that the API's estimate is
 * the courier's arrival at the customer's door, not at the stall's counter — no news to the stall.
 * Null when the API has no estimate (or none matters).
 */
export function courierEtaText(
  order: Pick<OrderDto, 'status' | 'etaAt' | 'delivery'>,
): string | null {
  const at = order.delivery?.etaAt ?? order.etaAt;
  if (at === null) return null;
  const clock = orderClock(at);
  switch (order.status) {
    case ORDER_STATUS.PICKED_UP:
    case ORDER_STATUS.IN_DELIVERY:
      return `Клиент получит около ${clock}`;
    default:
      return null;
  }
}

/** Of two copies of one order — the list's and one fetched by hand — the one that changed last. */
export function freshest<T extends { updatedAt: string }>(
  a: T | null | undefined,
  b: T | null | undefined,
): T | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}

// ---- declining ----------------------------------------------------------------------------------

export type DeclineReason = 'OUT_OF_STOCK' | 'CLOSING' | 'OTHER';

export const DECLINE_REASONS: readonly DeclineReason[] = ['OUT_OF_STOCK', 'CLOSING', 'OTHER'];

export const DECLINE_REASON_LABEL: Record<DeclineReason, string> = {
  OUT_OF_STOCK: 'Нет в наличии',
  CLOSING: 'Закрываемся',
  OTHER: 'Другая причина',
};

/** The API takes 3…500 characters; the chip's label takes some of them. */
export const DECLINE_NOTE_MAX = 300;
const DECLINE_MIN = 3;

/**
 * The reason that goes to the API (and on to the customer): the chip, then the note after it.
 * «Другая причина» says nothing by itself, so it needs the note. Null while too little is said.
 */
export function declineText(reason: DeclineReason | null, note: string): string | null {
  if (reason === null) return null;
  const extra = note.trim().slice(0, DECLINE_NOTE_MAX).trim();
  const label = DECLINE_REASON_LABEL[reason];
  const text = reason === 'OTHER' ? extra : extra ? `${label}: ${extra}` : label;
  return text.length >= DECLINE_MIN ? text : null;
}

/** What the API refused, in the stall's words; what it has no words for goes to the customer's table. */
const VENDOR_ERROR: Record<string, string> = {
  NETWORK: 'Нет связи. Проверьте интернет и попробуйте ещё раз',
  CONFLICT: 'Заказ только что изменился. Обновите экран и попробуйте снова',
  INVALID_STATE_TRANSITION: 'Заказ уже изменился — с ним это больше нельзя сделать',
  ORDER_NOT_CANCELLABLE: 'Курьер уже забрал заказ: отменить его может только поддержка',
  FORBIDDEN: 'Это не заказ вашего прилавка',
  NOT_FOUND: 'Такого заказа нет',
};

export function vendorErrorText(error: unknown): string {
  if (isApiError(error)) {
    const known = VENDOR_ERROR[error.code];
    if (known !== undefined) return known;
  }
  return describeOrderError(error);
}
