/**
 * What a stall's Orders screen and its alert rest on: which pile an order is in, what the stall may
 * still do with it, which orders it has not yet been told about — and the words and clock it reads
 * them by.
 */
import { ApiError } from '@bazar/api-client';
import {
  ALL_ORDER_STATUSES,
  ORDER_STATUS,
  type OrderStatus,
  type ProductUnit,
} from '@bazar/constants';
import type { OrderDto } from '@bazar/types';
import { describe, expect, it } from 'vitest';

import {
  DECLINE_NOTE_MAX,
  VENDOR_PILES,
  canConfirm,
  canDecline,
  courierAtStall,
  courierInPlay,
  courierEtaText,
  customerFirstName,
  declineText,
  defaultPile,
  freshest,
  goodsEstimated,
  isWeighed,
  itemCountText,
  itemNamesText,
  itemQuantityText,
  orderClock,
  pickPile,
  dateLabel,
  placedLabel,
  scheduleHint,
  shownPile,
  unseenOrders,
  vendorErrorText,
  vendorPileOf,
  vendorPiles,
  vendorStatusHint,
  vendorStatusText,
  type VendorPile,
} from './vendor-orders.js';

const NOW = Date.parse('2026-10-01T08:00:00Z');
const order = (id: string, status: OrderStatus, minutesAgo: number): OrderDto =>
  ({ id, status, placedAt: new Date(NOW - minutesAgo * 60_000).toISOString() }) as OrderDto;

describe('vendorPileOf', () => {
  it('puts every status in exactly one pile', () => {
    expect(vendorPileOf(ORDER_STATUS.PENDING)).toBe('fresh');
    for (const status of [
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.SEARCHING_COURIER,
      ORDER_STATUS.COURIER_ASSIGNED,
      ORDER_STATUS.COURIER_ARRIVED_PICKUP,
      ORDER_STATUS.PICKING_UP,
      ORDER_STATUS.PICKED_UP,
      ORDER_STATUS.IN_DELIVERY,
      ORDER_STATUS.COURIER_ARRIVED,
    ]) {
      expect(vendorPileOf(status)).toBe('working');
    }
    for (const status of [
      ORDER_STATUS.DELIVERED,
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.FAILED,
      ORDER_STATUS.REFUNDED,
    ]) {
      expect(vendorPileOf(status)).toBe('done');
    }
  });
});

describe('what the stall may do', () => {
  it('accepts only what waits for it', () => {
    expect(canConfirm(ORDER_STATUS.PENDING)).toBe(true);
    expect(canConfirm(ORDER_STATUS.CONFIRMED)).toBe(false);
  });

  it('declines only while the goods are still its own', () => {
    for (const status of [
      ORDER_STATUS.PENDING,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.SEARCHING_COURIER,
      ORDER_STATUS.COURIER_ASSIGNED,
      ORDER_STATUS.COURIER_ARRIVED_PICKUP,
    ]) {
      expect(canDecline(status)).toBe(true);
    }
    for (const status of [ORDER_STATUS.PICKED_UP, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED]) {
      expect(canDecline(status)).toBe(false);
    }
  });
});

describe('vendorPiles', () => {
  it('sorts each pile newest first', () => {
    const piles = vendorPiles([
      order('old', ORDER_STATUS.DELIVERED, 300),
      order('a', ORDER_STATUS.CONFIRMED, 30),
      order('b', ORDER_STATUS.CONFIRMED, 5),
      order('new', ORDER_STATUS.PENDING, 1),
      order('done', ORDER_STATUS.DELIVERED, 10),
    ]);
    expect(piles.fresh.map((o) => o.id)).toEqual(['new']);
    expect(piles.working.map((o) => o.id)).toEqual(['b', 'a']);
    expect(piles.done.map((o) => o.id)).toEqual(['done', 'old']);
  });
});

describe('unseenOrders', () => {
  it('is what is alive, recent and not yet acknowledged — the longest-waiting first', () => {
    const orders = [
      order('fresh', ORDER_STATUS.PENDING, 2),
      order('auto', ORDER_STATUS.CONFIRMED, 9),
      order('seen', ORDER_STATUS.CONFIRMED, 4),
      order('done', ORDER_STATUS.DELIVERED, 6),
      order('morning', ORDER_STATUS.CONFIRMED, 5 * 60),
    ];
    expect(unseenOrders(orders, new Set(['seen']), NOW).map((o) => o.id)).toEqual([
      'auto',
      'fresh',
    ]);
  });

  it('is empty once everything has been acknowledged', () => {
    expect(unseenOrders([order('a', ORDER_STATUS.PENDING, 1)], new Set(['a']), NOW)).toEqual([]);
  });
});

const sizes = (fresh: number, working: number, done: number): Record<VendorPile, number[]> => ({
  fresh: Array.from({ length: fresh }, (_, i) => i),
  working: Array.from({ length: working }, (_, i) => i),
  done: Array.from({ length: done }, (_, i) => i),
});

describe('defaultPile', () => {
  it('opens on what waits for an answer, however much else there is', () => {
    expect(defaultPile(sizes(1, 4, 30))).toBe('fresh');
  });

  it('opens on what is being carried, then on the past', () => {
    expect(defaultPile(sizes(0, 2, 9))).toBe('working');
    expect(defaultPile(sizes(0, 0, 9))).toBe('done');
  });

  it('says «Новые» when there is nothing at all', () => {
    expect(defaultPile(sizes(0, 0, 0))).toBe('fresh');
  });

  it('looks in the order the segments are laid out', () => {
    expect(VENDOR_PILES).toEqual(['fresh', 'working', 'done']);
  });
});

describe('shownPile', () => {
  it('follows the default until the stall picks', () => {
    expect(shownPile(null, sizes(1, 0, 0))).toBe('fresh');
    expect(shownPile(null, sizes(0, 0, 3))).toBe('done');
  });

  it('keeps what the stall picked, as orders come and go', () => {
    const pick = pickPile('working', sizes(1, 2, 0));
    expect(shownPile(pick, sizes(1, 2, 0))).toBe('working');
    expect(shownPile(pick, sizes(3, 1, 5))).toBe('working');
  });

  it('lets go of a pile that ran dry: the last new order was answered', () => {
    const pick = pickPile('fresh', sizes(1, 0, 4));
    expect(shownPile(pick, sizes(0, 1, 4))).toBe('working');
    expect(shownPile(pick, sizes(0, 0, 5))).toBe('done');
  });

  it('keeps a pile the stall opened empty: they asked for it', () => {
    const pick = pickPile('done', sizes(2, 0, 0));
    expect(pick.filled).toBe(false);
    expect(shownPile(pick, sizes(2, 0, 0))).toBe('done');
  });
});

describe('vendorStatusText', () => {
  it('has a line for every status, and only the stall-facing ones', () => {
    for (const status of ALL_ORDER_STATUSES) {
      expect(vendorStatusText(status).length).toBeGreaterThan(0);
    }
    expect(vendorStatusText(ORDER_STATUS.PENDING)).toBe('Ждёт вашего ответа');
    expect(vendorStatusText(ORDER_STATUS.SEARCHING_COURIER)).toBe('Ищем курьера');
    expect(vendorStatusText(ORDER_STATUS.COURIER_ASSIGNED)).toBe('Курьер едет к вам');
    expect(vendorStatusText(ORDER_STATUS.COURIER_ARRIVED_PICKUP)).toBe('Курьер у вас');
    expect(vendorStatusText(ORDER_STATUS.PICKED_UP)).toBe('Забрали');
    expect(vendorStatusText(ORDER_STATUS.IN_DELIVERY)).toBe('В пути к клиенту');
    expect(vendorStatusText(ORDER_STATUS.DELIVERED)).toBe('Доставлен');
    expect(vendorStatusText(ORDER_STATUS.CANCELLED)).toBe('Отменён');
  });

  it('gives every status a distinct line', () => {
    const lines = ALL_ORDER_STATUSES.map(vendorStatusText);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('tells the stall what to do only while there is something to do', () => {
    expect(vendorStatusHint(ORDER_STATUS.COURIER_ARRIVED_PICKUP)).toBe('Отдайте ему заказ');
    expect(vendorStatusHint(ORDER_STATUS.DELIVERED)).toBeNull();
  });
});

describe('courierAtStall', () => {
  it('is the two statuses in which the courier is at the counter', () => {
    const at = ALL_ORDER_STATUSES.filter(courierAtStall);
    expect(at).toEqual([ORDER_STATUS.COURIER_ARRIVED_PICKUP, ORDER_STATUS.PICKING_UP]);
  });
});

describe('courierInPlay', () => {
  it('is the span between the search for a courier and the end of the order', () => {
    expect(ALL_ORDER_STATUSES.filter(courierInPlay)).toEqual([
      ORDER_STATUS.SEARCHING_COURIER,
      ORDER_STATUS.COURIER_ASSIGNED,
      ORDER_STATUS.COURIER_ARRIVED_PICKUP,
      ORDER_STATUS.PICKING_UP,
      ORDER_STATUS.PICKED_UP,
      ORDER_STATUS.IN_DELIVERY,
      ORDER_STATUS.COURIER_ARRIVED,
    ]);
  });
});

describe('the clock', () => {
  it('reads Tashkent time whatever zone the phone is in', () => {
    expect(orderClock('2026-10-01T09:05:00Z')).toBe('14:05');
    expect(orderClock('2026-10-01T19:30:00Z')).toBe('00:30');
  });

  it('says «сегодня» and «вчера» by the Tashkent calendar, not UTC', () => {
    const now = new Date('2026-10-01T20:00:00Z'); // 01:00 on 2 October in Tashkent
    expect(placedLabel('2026-10-01T19:30:00Z', now)).toBe('сегодня, 00:30');
    expect(placedLabel('2026-10-01T09:05:00Z', now)).toBe('вчера, 14:05');
  });

  it('names the date once it is older than yesterday, and the year once it is not this one', () => {
    const now = new Date(NOW);
    expect(placedLabel('2026-09-28T04:12:00Z', now)).toBe('28 сентября, 09:12');
    expect(placedLabel('2025-12-31T10:00:00Z', now)).toBe('31 декабря 2025, 15:00');
  });
});

describe('scheduleHint', () => {
  it('says nothing about an order that is wanted as soon as possible', () => {
    expect(scheduleHint(null, new Date(NOW))).toBeNull();
  });

  it('names the window of a slot order', () => {
    const now = new Date(NOW);
    expect(scheduleHint('2026-10-02T03:00:00Z', now)).toBe('Запланирован на завтра 08:00–10:00');
    expect(scheduleHint('2026-10-01T07:00:00Z', now)).toBe('Запланирован на сегодня 12:00–14:00');
  });
});

describe('the goods', () => {
  const line = (ru: string) => ({ name: { ru } });

  it('counts positions in Russian', () => {
    expect([1, 2, 5, 11, 21].map(itemCountText)).toEqual([
      '1 позиция',
      '2 позиции',
      '5 позиций',
      '11 позиций',
      '21 позиция',
    ]);
  });

  it('names the first two and counts the rest', () => {
    expect(itemNamesText([line('Помидоры')])).toBe('Помидоры');
    expect(itemNamesText([line('Помидоры'), line('Огурцы')])).toBe('Помидоры, Огурцы');
    expect(itemNamesText([line('Помидоры'), line('Огурцы'), line('Зира'), line('Мята')])).toBe(
      'Помидоры, Огурцы и ещё 2',
    );
    expect(itemNamesText([])).toBe('');
  });

  it('writes the quantity with its unit and the decimal comma', () => {
    expect(itemQuantityText({ quantity: 1.5, unit: 'KG' })).toBe('1,5 кг');
    expect(itemQuantityText({ quantity: 3, unit: 'PCS' })).toBe('3 шт');
  });

  it('knows which goods are weighed at the stall', () => {
    expect(isWeighed('KG')).toBe(true);
    expect(isWeighed('G')).toBe(true);
    expect(isWeighed('PCS')).toBe(false);
    expect(isWeighed('L')).toBe(false);
  });
});

describe('goodsEstimated', () => {
  const basket = (status: OrderStatus, ...lines: [ProductUnit, number | null][]) => ({
    status,
    items: lines.map(([unit, actualQuantity]) => ({ unit, actualQuantity })) as OrderDto['items'],
  });

  it('is true while a weighed line has not been weighed', () => {
    expect(goodsEstimated(basket(ORDER_STATUS.CONFIRMED, ['KG', null], ['PCS', null]))).toBe(true);
  });

  it('is false once the scale has spoken, for goods sold by the piece, and for a closed order', () => {
    expect(goodsEstimated(basket(ORDER_STATUS.PICKED_UP, ['KG', 1.04]))).toBe(false);
    expect(goodsEstimated(basket(ORDER_STATUS.CONFIRMED, ['PCS', null], ['L', null]))).toBe(false);
    expect(goodsEstimated(basket(ORDER_STATUS.CANCELLED, ['KG', null]))).toBe(false);
  });
});

describe('customerFirstName', () => {
  it('keeps the first name and nothing after it', () => {
    expect(customerFirstName({ firstName: '  Азиз Каримов ' })).toBe('Азиз');
    expect(customerFirstName({ firstName: 'Азиз' })).toBe('Азиз');
  });

  it('falls back to «Клиент» when the name is missing or blank', () => {
    expect(customerFirstName(null)).toBe('Клиент');
    expect(customerFirstName({ firstName: null })).toBe('Клиент');
    expect(customerFirstName({ firstName: '   ' })).toBe('Клиент');
  });
});

describe('courierEtaText', () => {
  const at = (status: OrderStatus, etaAt: string | null, deliveryEta: string | null = null) =>
    ({
      status,
      etaAt,
      delivery: deliveryEta === null ? null : { etaAt: deliveryEta },
    }) as Pick<OrderDto, 'status' | 'etaAt' | 'delivery'>;

  it('tells when the customer gets the goods, once they have left the stall', () => {
    const eta = '2026-10-01T09:20:00Z';
    expect(courierEtaText(at(ORDER_STATUS.IN_DELIVERY, eta))).toBe('Клиент получит около 14:20');
    expect(courierEtaText(at(ORDER_STATUS.PICKED_UP, null, eta))).toBe(
      'Клиент получит около 14:20',
    );
  });

  it('prefers the trip’s estimate to the order’s', () => {
    const order = at(ORDER_STATUS.IN_DELIVERY, '2026-10-01T10:00:00Z', '2026-10-01T09:20:00Z');
    expect(courierEtaText(order)).toBe('Клиент получит около 14:20');
  });

  it('does not call the courier’s arrival at the customer the courier’s arrival at the stall', () => {
    expect(courierEtaText(at(ORDER_STATUS.COURIER_ASSIGNED, '2026-10-01T09:20:00Z'))).toBeNull();
  });

  it('is silent without an estimate, and when the estimate is no news to the stall', () => {
    expect(courierEtaText(at(ORDER_STATUS.COURIER_ASSIGNED, null))).toBeNull();
    expect(courierEtaText(at(ORDER_STATUS.CONFIRMED, '2026-10-01T09:20:00Z'))).toBeNull();
    expect(
      courierEtaText(at(ORDER_STATUS.COURIER_ARRIVED_PICKUP, '2026-10-01T09:20:00Z')),
    ).toBeNull();
  });
});

describe('freshest', () => {
  const copy = (updatedAt: string, tag: string) => ({ updatedAt, tag });

  it('takes the copy that changed last, and the list’s on a tie', () => {
    const old = copy('2026-10-01T08:00:00Z', 'old');
    const young = copy('2026-10-01T08:00:05Z', 'young');
    expect(freshest(old, young)).toBe(young);
    expect(freshest(young, old)).toBe(young);
    expect(freshest(old, copy('2026-10-01T08:00:00Z', 'twin'))).toBe(old);
  });

  it('takes the one there is', () => {
    const only = copy('2026-10-01T08:00:00Z', 'only');
    expect(freshest(only, undefined)).toBe(only);
    expect(freshest(null, only)).toBe(only);
    expect(freshest(undefined, null)).toBeNull();
  });
});

describe('declineText', () => {
  it('needs a chip', () => {
    expect(declineText(null, 'Нет помидоров')).toBeNull();
  });

  it('is the chip itself, with the note after it when there is one', () => {
    expect(declineText('OUT_OF_STOCK', '')).toBe('Нет в наличии');
    expect(declineText('CLOSING', '  ')).toBe('Закрываемся');
    expect(declineText('OUT_OF_STOCK', ' помидоров нет ')).toBe('Нет в наличии: помидоров нет');
  });

  it('asks «Другая причина» for words of its own — the API wants at least three characters', () => {
    expect(declineText('OTHER', '')).toBeNull();
    expect(declineText('OTHER', 'ab')).toBeNull();
    expect(declineText('OTHER', ' Перерыв ')).toBe('Перерыв');
  });

  it('stays inside the API’s 500 characters', () => {
    const long = 'я'.repeat(1000);
    expect(declineText('OTHER', long)).toHaveLength(DECLINE_NOTE_MAX);
    expect((declineText('OUT_OF_STOCK', long) ?? '').length).toBeLessThanOrEqual(500);
  });
});

describe('vendorErrorText', () => {
  it('speaks Russian about a dead connection and a lost race', () => {
    expect(vendorErrorText(ApiError.network(new Error('offline')))).toBe(
      'Нет связи. Проверьте интернет и попробуйте ещё раз',
    );
    const raced = new ApiError(409, { code: 'INVALID_STATE_TRANSITION', message: 'Cannot move' });
    expect(vendorErrorText(raced)).toMatch(/^Заказ уже изменился/);
  });

  it('leaves the rest to the order table: its reasons, then the code', () => {
    const closed = new ApiError(422, { code: 'STORE_CLOSED', message: 'Store is closed' });
    expect(vendorErrorText(closed)).toBe('Точка сейчас закрыта');
    const odd = new ApiError(500, { code: 'BOOM', message: 'Boom' });
    expect(vendorErrorText(odd)).toBe('Boom (BOOM)');
    expect(vendorErrorText(new Error('x'))).toBe('Что-то пошло не так. Попробуйте ещё раз.');
  });
});

describe('the day a regular first bought', () => {
  it('is the Tashkent date, with the year once it is not this one', () => {
    const now = new Date('2026-10-05T10:00:00Z');
    // 21:30 UTC on 4 Sep is already 5 Sep in Tashkent.
    expect(dateLabel('2026-09-04T21:30:00Z', now)).toBe('5 сентября');
    expect(dateLabel('2025-12-31T10:00:00Z', now)).toBe('31 декабря 2025');
  });
});
