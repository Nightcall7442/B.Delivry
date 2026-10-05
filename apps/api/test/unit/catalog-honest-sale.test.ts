/**
 * «Честная скидка». A seller types the sale price only; the struck-through price is the lowest the
 * good cost over the last week, read from the price history — so a price raised on Monday to be
 * «cut» on Tuesday shows no discount at all, and there is no «old price» to type: an edit may only
 * end a sale, and a spreadsheet's «old_price» goes through the same honest cut. A price raised to
 * or past the old one ends the sale by itself. A real cut is an event the customers who saved the
 * good hear about, once a day at most. And a sale nobody touched for the whole week ends by
 * itself: by then the struck price is one nobody has paid in seven days.
 *
 * Real ProductsService and the favorites sale handler; the repository, the stores, the cache and
 * the queue are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, SALE, type Role } from '@bazar/constants';
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import type { DomainEvent, EventBus, EventHandler } from '../../src/events/event-bus.js';
import type { EventName } from '../../src/events/event-types.js';
import { registerFavoritesSaleHandlers } from '../../src/events/handlers/favorites-sale.handler.js';
import { PRODUCT_EVENT } from '../../src/modules/products/domain/product.events.js';
import {
  createProductSchema,
  updateProductSchema,
} from '../../src/modules/products/schemas/index.js';
import { ProductsRepository } from '../../src/modules/products/repository/products.repository.js';
import { ProductsService } from '../../src/modules/products/service/products.service.js';
import { systemContext } from '../../src/common/types/request-context.js';

const TENANT = 't1';
const DAY = 86_400_000;

const ctx = (user: AuthenticatedUser | null): RequestContext => ({
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});

const as = (name: string, roles: Role[], ids: { vendorId?: string } = {}) =>
  ctx({
    id: `user-${name}`,
    tenantId: TENANT,
    roles,
    permissions: effectivePermissions(roles),
    sessionId: 's1',
    locale: 'ru',
    ...ids,
  });

const owner = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const stranger = as('vendor-2', [ROLE.VENDOR], { vendorId: 'vendor-2' });

const logger = { error() {}, warn() {}, info() {}, debug() {} };

interface Row {
  id: string;
  storeId: string;
  name: Record<string, string>;
  price: number;
  oldPrice: number | null;
  currency: string;
  images: { url: string }[];
}

/** The price history as (days ago, price) pairs, newest last. */
function world(row: Partial<Row>, history: [number, number][]) {
  const product: Row = {
    id: 'p1',
    storeId: 's1',
    name: { ru: 'Помидоры' },
    price: 20_000_00,
    oldPrice: null,
    currency: 'UZS',
    images: [{ url: 'https://cdn.example/tomato.jpg' }],
    ...row,
  };
  const prices = history.map(([daysAgo, price]) => ({
    price,
    validFrom: new Date(Date.now() - daysAgo * DAY),
  }));
  const published: DomainEvent[] = [];
  const repository = {
    async findById() {
      return product;
    },
    async lowestPriceSince(_id: string, since: Date) {
      const before = prices.filter((p) => p.validFrom < since).at(-1);
      const after = prices.filter((p) => p.validFrom >= since).map((p) => p.price);
      const all = [...(before ? [before.price] : []), ...after];
      return all.length === 0 ? null : Math.min(...all);
    },
    async setSale(_id: string, next: { price: number; oldPrice: number | null }) {
      product.price = next.price;
      product.oldPrice = next.oldPrice;
      prices.push({ price: next.price, validFrom: new Date() });
      return product;
    },
    async categoryIdsBySlug() {
      return new Map<string, string>();
    },
    async findByNameRu() {
      return 'p1';
    },
    async replaceImages() {},
    async update(
      _id: string,
      input: { price?: { amount: number }; oldPrice?: { amount: number } | null },
    ) {
      if (input.price !== undefined) product.price = input.price.amount;
      if (input.oldPrice !== undefined) product.oldPrice = input.oldPrice?.amount ?? null;
      return product;
    },
  };
  const service = new ProductsService({
    repository,
    stores: {
      async get() {
        return { id: 's1', tenantId: TENANT, vendorId: 'vendor-1' };
      },
    },
    cache: { async invalidateByTag() {} },
    logger,
    events: {
      async publish(event: DomainEvent) {
        published.push(event);
      },
    },
  } as never);
  return { service, product, published };
}

const som = (n: number) => money(n * 100, 'UZS');

describe('starting a sale', () => {
  it('strikes through the lowest price of the week, not the price of the day', async () => {
    // 20 000 all week, raised to 30 000 yesterday, «cut» to 25 000 today.
    const { service, product } = world({ price: 30_000_00 }, [
      [10, 20_000_00],
      [1, 30_000_00],
    ]);
    await expect(
      runWithContext(owner, () => service.startSale('p1', som(25_000))),
    ).rejects.toBeInstanceOf(ConflictError);
    // A real cut below the week's lowest is a sale, struck through at that lowest.
    await runWithContext(owner, () => service.startSale('p1', som(18_000)));
    expect(product).toMatchObject({ price: 18_000_00, oldPrice: 20_000_00 });
  });

  it(`forgets prices older than ${SALE.REFERENCE_DAYS} days`, async () => {
    const { service, product } = world({ price: 25_000_00 }, [
      [SALE.REFERENCE_DAYS + 5, 15_000_00],
      [SALE.REFERENCE_DAYS + 1, 25_000_00],
    ]);
    await runWithContext(owner, () => service.startSale('p1', som(22_000)));
    expect(product).toMatchObject({ price: 22_000_00, oldPrice: 25_000_00 });
  });

  it('measures every cut anew: a deeper one is struck through at the price it cut', async () => {
    const { service, product, published } = world({ price: 20_000_00 }, [[3, 20_000_00]]);
    await runWithContext(owner, () => service.startSale('p1', som(16_000)));
    expect(product).toMatchObject({ price: 16_000_00, oldPrice: 20_000_00 });
    await runWithContext(owner, () => service.startSale('p1', som(14_000)));
    // 16 000 was charged this week: that is the honest «было».
    expect(product).toMatchObject({ price: 14_000_00, oldPrice: 16_000_00 });
    // Climbing back through a «sale» is no cut at all.
    await expect(
      runWithContext(owner, () => service.startSale('p1', som(17_000))),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(published.map((e) => e.payload)).toEqual([
      expect.objectContaining({ price: 16_000_00, oldPrice: 20_000_00 }),
      expect.objectContaining({ price: 14_000_00, oldPrice: 16_000_00 }),
    ]);
  });

  it('does not lean on a struck-through price older than the week', async () => {
    // On sale at 15 000 «from 30 000» for a month: the week knows only 15 000.
    const { service } = world({ price: 15_000_00, oldPrice: 30_000_00 }, [
      [40, 30_000_00],
      [30, 15_000_00],
    ]);
    await expect(
      runWithContext(owner, () => service.startSale('p1', som(16_000))),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('is the stall owner’s alone', async () => {
    const { service, product } = world({}, [[3, 20_000_00]]);
    await expect(
      runWithContext(stranger, () => service.startSale('p1', som(15_000))),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(product.oldPrice).toBeNull();
  });

  it('ends: the struck-through price is the price again', async () => {
    const { service, product } = world({ price: 15_000_00, oldPrice: 20_000_00 }, []);
    await runWithContext(owner, () => service.endSale('p1'));
    expect(product).toMatchObject({ price: 20_000_00, oldPrice: null });
    // Ending what is not on sale changes nothing.
    await runWithContext(owner, () => service.endSale('p1'));
    expect(product).toMatchObject({ price: 20_000_00, oldPrice: null });
  });
});

describe('an old price through the ordinary edit', () => {
  it('cannot be typed, on a new good or an edit — only taken away', () => {
    const base = {
      storeId: '00000000-0000-4000-8000-000000000001',
      name: { ru: 'Помидоры' },
      unit: 'KG',
      price: som(10_000),
      images: [{ url: 'https://cdn.example/a.jpg' }],
    };
    expect(createProductSchema.parse({ ...base, oldPrice: som(99_000) })).not.toHaveProperty(
      'oldPrice',
    );
    expect(updateProductSchema.safeParse({ oldPrice: som(99_000) }).success).toBe(false);
    expect(updateProductSchema.parse({ oldPrice: null })).toEqual({ oldPrice: null });
  });

  it('ends a sale when asked', async () => {
    const { service, product } = world({ price: 15_000_00, oldPrice: 20_000_00 }, []);
    await runWithContext(owner, () => service.update('p1', { oldPrice: null }));
    expect(product.oldPrice).toBeNull();
  });

  it('goes away by itself when the price is raised to it or past it', async () => {
    const { service, product } = world({ price: 15_000_00, oldPrice: 20_000_00 }, []);
    await runWithContext(owner, () => service.update('p1', { price: som(18_000) }));
    expect(product).toMatchObject({ price: 18_000_00, oldPrice: 20_000_00 });
    await runWithContext(owner, () => service.update('p1', { price: som(21_000) }));
    expect(product).toMatchObject({ price: 21_000_00, oldPrice: null });
  });
});

describe('a spreadsheet’s old_price', () => {
  const csv = (price: number, old: number) =>
    `name_ru;price;unit;image_url;old_price\nПомидоры;${price};KG;https://cdn.example/t.jpg;${old}`;

  it('goes through the honest cut: struck through at the week’s lowest, not at the column', async () => {
    const { service, product } = world({ price: 20_000_00 }, [[3, 20_000_00]]);
    await runWithContext(owner, () => service.importCsv('s1', csv(15_000, 99_000)));
    expect(product).toMatchObject({ price: 15_000_00, oldPrice: 20_000_00 });
  });

  it('is no sale when the row is no cut: the row’s price, nothing struck through', async () => {
    const { service, product } = world({ price: 20_000_00 }, [[3, 20_000_00]]);
    await runWithContext(owner, () => service.importCsv('s1', csv(25_000, 99_000)));
    expect(product).toMatchObject({ price: 25_000_00, oldPrice: null });
  });
});

describe('«подешевело» for the customers who saved it', () => {
  function bus() {
    const handlers = new Map<string, EventHandler<EventName>[]>();
    const events: EventBus = {
      on(name, handler) {
        handlers.set(name, [...(handlers.get(name) ?? []), handler as EventHandler<EventName>]);
      },
      async publish(event) {
        for (const handler of handlers.get(event.name) ?? []) await handler(event as never);
      },
    };
    return events;
  }

  const sale = (at = new Date('2026-10-05T07:00:00Z')): DomainEvent<'product.sale_started'> => ({
    id: 'e1',
    name: PRODUCT_EVENT.SALE_STARTED,
    tenantId: TENANT,
    at,
    payload: {
      productId: 'p1',
      storeId: 's1',
      name: { ru: 'Помидоры' },
      price: 15_000_00,
      oldPrice: 20_000_00,
      currency: 'UZS',
      imageUrl: null,
    },
  });

  it('tells every saver once a day, as a promo they can opt out of', async () => {
    const events = bus();
    const jobs: { payload: Record<string, unknown>; options: { jobId?: string } }[] = [];
    registerFavoritesSaleHandlers(events, {
      favorites: { saversOf: async () => ['cust-1', 'cust-2'] },
      queue: {
        async enqueue(
          _queue: string,
          _job: string,
          payload: Record<string, unknown>,
          options = {},
        ) {
          jobs.push({ payload, options });
        },
      } as never,
    });
    await events.publish(sale());
    expect(jobs.map((j) => j.payload['userId'])).toEqual(['cust-1', 'cust-2']);
    expect(jobs[0]?.payload).toMatchObject({
      template: 'promo.generic',
      deepLink: '/product/p1',
      params: { title: 'Подешевело: Помидоры' },
    });
    expect(String((jobs[0]?.payload['params'] as Record<string, string>)['body'])).toContain(
      '−25 %',
    );
    // The same day's second cut carries the same keys: the queue and the notification row drop it.
    expect(jobs[0]?.options.jobId).toBe('sale:p1:2026-10-05:cust-1');
  });

  it('sends nothing when nobody saved it', async () => {
    const events = bus();
    const jobs: unknown[] = [];
    registerFavoritesSaleHandlers(events, {
      favorites: { saversOf: async () => [] },
      queue: {
        async enqueue(...args: unknown[]) {
          jobs.push(args);
        },
      } as never,
    });
    await events.publish(sale());
    expect(jobs).toEqual([]);
  });
});

describe('a sale left alone for the week', () => {
  const NOW = new Date('2026-10-12T10:00:00Z');
  const SINCE = new Date(NOW.getTime() - SALE.REFERENCE_DAYS * DAY);

  interface Shelf {
    id: string;
    storeId: string;
    price: number;
    oldPrice: number | null;
    /** Days ago of each price change, newest last. */
    changed: number[];
  }
  const good = (id: string, storeId: string, oldPrice: number | null, changed: number[]) => ({
    id,
    storeId,
    price: 18_000_00,
    oldPrice,
    changed,
  });

  /** Products and their history; the repository's stale test is the one it sends to the database. */
  function sweep(shelf: Shelf[], options: { cutMeanwhile?: string } = {}) {
    const invalidated: string[] = [];
    const pages: number[] = [];
    const stale = (row: Shelf) =>
      row.oldPrice !== null &&
      row.changed.every((daysAgo) => NOW.getTime() - daysAgo * DAY < SINCE.getTime());
    const service = new ProductsService({
      repository: {
        async staleSales(since: Date, limit: number) {
          expect(since).toEqual(SINCE);
          const page = shelf.filter(stale).slice(0, limit);
          pages.push(page.length);
          return page.map(({ id, storeId }) => ({ id, storeId }));
        },
        async endStaleSales(ids: string[]) {
          // The seller cut it again between the read and the write: the write's own check keeps it.
          const cut = shelf.find((row) => row.id === options.cutMeanwhile);
          if (cut) cut.changed.push(0);
          let count = 0;
          for (const row of shelf) {
            if (ids.includes(row.id) && stale(row)) {
              row.oldPrice = null;
              count += 1;
            }
          }
          return count;
        },
      },
      stores: {},
      cache: {
        async invalidateByTag(tag: string) {
          invalidated.push(tag);
        },
      },
      logger,
      events: { async publish() {} },
    } as never);
    const run = (batch?: number) =>
      runWithContext(systemContext(TENANT, 'job', 'uz'), () => service.endStaleSales(NOW, batch));
    return { run, invalidated, pages };
  }

  it('loses its struck price; the price itself stays', async () => {
    const shelf = [
      good('cut-8-days-ago', 's1', 22_000_00, [20, 8]),
      good('cut-3-days-ago', 's1', 22_000_00, [20, 3]),
      good('not-on-sale', 's2', null, [30]),
      // Set before the history was kept (or by hand): no change in the week, nothing to lean on.
      good('no-history', 's2', 25_000_00, []),
    ];
    const { run, invalidated } = sweep(shelf);
    expect(await run()).toBe(2);
    expect(shelf.map((row) => [row.id, row.price, row.oldPrice])).toEqual([
      ['cut-8-days-ago', 18_000_00, null],
      ['cut-3-days-ago', 18_000_00, 22_000_00],
      ['not-on-sale', 18_000_00, null],
      ['no-history', 18_000_00, null],
    ]);
    // The shop window of each stall it touched is read afresh.
    expect(invalidated).toEqual(['store:s1', 'categories', 'store:s2', 'categories']);
  });

  it('goes page by page, and a page cut again meanwhile does not spin', async () => {
    const shelf = Array.from({ length: 5 }, (_, i) => good(`p${i}`, 's1', 22_000_00, [9]));
    const { run, pages } = sweep(shelf);
    expect(await run(2)).toBe(5);
    expect(pages).toEqual([2, 2, 1]);

    const again = [good('q1', 's1', 22_000_00, [9])];
    const meanwhile = sweep(again, { cutMeanwhile: 'q1' });
    expect(await meanwhile.run(1)).toBe(0);
    expect(meanwhile.pages).toEqual([1]);
    expect(again[0]?.oldPrice).toBe(22_000_00);
  });

  it('is asked of the database as: this tenant, on sale, no price change since the week began', async () => {
    const sent: { op: string; where: Record<string, unknown> }[] = [];
    const prisma = {
      product: {
        async findMany(args: { where: Record<string, unknown> }) {
          sent.push({ op: 'findMany', where: args.where });
          return [];
        },
        async updateMany(args: { where: Record<string, unknown>; data: unknown }) {
          sent.push({ op: 'updateMany', where: args.where });
          expect(args.data).toEqual({ oldPrice: null });
          return { count: 1 };
        },
      },
    };
    const repository = new ProductsRepository(prisma as never);
    await runWithContext(systemContext(TENANT, 'job', 'uz'), async () => {
      await repository.staleSales(SINCE, 100);
      await repository.endStaleSales(['p1'], SINCE);
      // Nothing to end: no write at all.
      expect(await repository.endStaleSales([], SINCE)).toBe(0);
    });
    const stale = {
      tenantId: TENANT,
      oldPrice: { not: null },
      priceHistory: { none: { validFrom: { gte: SINCE } } },
    };
    expect(sent).toEqual([
      { op: 'findMany', where: stale },
      { op: 'updateMany', where: { ...stale, id: { in: ['p1'] } } },
    ]);
  });
});
