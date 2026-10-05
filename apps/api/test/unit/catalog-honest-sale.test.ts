/**
 * «Честная скидка». A seller types the sale price only; the struck-through price is the lowest the
 * good cost over the last week, read from the price history — so a price raised on Monday to be
 * «cut» on Tuesday shows no discount at all, and an «old price» typed by hand at or below the price
 * is refused. A price raised to or past the old one ends the sale by itself. A real cut is an event
 * the customers who saved the good hear about, once a day at most.
 *
 * Real ProductsService and the favorites sale handler; the repository, the stores, the cache and
 * the queue are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, SALE, type Role } from '@bazar/constants';
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, ValidationError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import type { DomainEvent, EventBus, EventHandler } from '../../src/events/event-bus.js';
import type { EventName } from '../../src/events/event-types.js';
import { registerFavoritesSaleHandlers } from '../../src/events/handlers/favorites-sale.handler.js';
import { PRODUCT_EVENT } from '../../src/modules/products/domain/product.events.js';
import { ProductsService } from '../../src/modules/products/service/products.service.js';

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

  it('keeps the price the sale started from when the cut goes deeper or shallower', async () => {
    const { service, product, published } = world({ price: 20_000_00 }, [[3, 20_000_00]]);
    await runWithContext(owner, () => service.startSale('p1', som(16_000)));
    await runWithContext(owner, () => service.startSale('p1', som(14_000)));
    expect(product).toMatchObject({ price: 14_000_00, oldPrice: 20_000_00 });
    await runWithContext(owner, () => service.startSale('p1', som(17_000)));
    expect(product).toMatchObject({ price: 17_000_00, oldPrice: 20_000_00 });
    // Two cuts are news; climbing back is not.
    expect(published.map((e) => e.name)).toEqual([
      PRODUCT_EVENT.SALE_STARTED,
      PRODUCT_EVENT.SALE_STARTED,
    ]);
    expect(published[1]?.payload).toMatchObject({ price: 14_000_00, oldPrice: 20_000_00 });
    // Not below where it started: refused.
    await expect(
      runWithContext(owner, () => service.startSale('p1', som(20_000))),
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
  it('is refused at or below the price', async () => {
    const { service } = world({ price: 20_000_00 }, []);
    await expect(
      runWithContext(owner, () => service.update('p1', { oldPrice: som(20_000) })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      runWithContext(owner, () =>
        service.update('p1', { price: som(30_000), oldPrice: som(25_000) }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('goes away by itself when the price is raised to it or past it', async () => {
    const { service, product } = world({ price: 15_000_00, oldPrice: 20_000_00 }, []);
    await runWithContext(owner, () => service.update('p1', { price: som(18_000) }));
    expect(product).toMatchObject({ price: 18_000_00, oldPrice: 20_000_00 });
    await runWithContext(owner, () => service.update('p1', { price: som(21_000) }));
    expect(product).toMatchObject({ price: 21_000_00, oldPrice: null });
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
