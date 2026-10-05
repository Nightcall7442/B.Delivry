/**
 * «Снова в наличии»: a good someone saved could not be bought — the seller switched it off, or its
 * counted stock ran out — and now it can. Whoever saved it hears so, once a day at most; an edit of
 * a good that was on the counter all along says nothing, and neither does switching one off.
 *
 * Real ProductsService and the favorites handler; the repository, the stores, the cache and the
 * queue are fakes.
 */
import { effectivePermissions } from '@bazar/auth';
import { ROLE } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import type { DomainEvent, EventBus, EventHandler } from '../../src/events/event-bus.js';
import type { EventName } from '../../src/events/event-types.js';
import { registerFavoritesSaleHandlers } from '../../src/events/handlers/favorites-sale.handler.js';
import { PRODUCT_EVENT } from '../../src/modules/products/domain/product.events.js';
import { ProductsService } from '../../src/modules/products/service/products.service.js';

const TENANT = 't1';
const logger = { error() {}, warn() {}, info() {}, debug() {} };

const owner: RequestContext = {
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user: {
    id: 'user-vendor-1',
    tenantId: TENANT,
    roles: [ROLE.VENDOR],
    permissions: effectivePermissions([ROLE.VENDOR]),
    sessionId: 's1',
    locale: 'ru',
    vendorId: 'vendor-1',
  },
  ip: null,
  userAgent: null,
  startedAt: new Date(),
};

interface Shelf {
  available: boolean;
  /** Counted stock as Prisma returns it (a Decimal); null when the stall does not count. */
  stock: string | null;
}

function world(shelf: Shelf) {
  const product = {
    id: 'p1',
    storeId: 's1',
    name: { ru: 'Помидоры', uz: 'Pomidor' },
    price: 18_000_00,
    oldPrice: null,
    currency: 'UZS',
    images: [{ url: 'https://cdn.example/tomato.jpg' }],
    ...shelf,
  };
  const published: DomainEvent[] = [];
  const service = new ProductsService({
    repository: {
      async findById() {
        return { ...product };
      },
      async setAvailability(_id: string, available: boolean) {
        product.available = available;
      },
      async update(_id: string, input: { stock?: number; available?: boolean }) {
        if (input.stock !== undefined) product.stock = String(input.stock);
        if (input.available !== undefined) product.available = input.available;
        return { ...product };
      },
      async categorySlug() {
        return null;
      },
    },
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
  const run = <T>(fn: () => Promise<T>) => runWithContext(owner, fn);
  const back = () => published.filter((e) => e.name === PRODUCT_EVENT.BACK_IN_STOCK);
  return { service, run, back };
}

describe('a good back on the counter', () => {
  it('is news when the seller switches it back on', async () => {
    const { service, run, back } = world({ available: false, stock: null });
    await run(() => service.setAvailability('p1', true));
    expect(back()).toEqual([
      expect.objectContaining({
        payload: {
          productId: 'p1',
          storeId: 's1',
          name: { ru: 'Помидоры', uz: 'Pomidor' },
          price: 18_000_00,
          currency: 'UZS',
          imageUrl: 'https://cdn.example/tomato.jpg',
        },
      }),
    ]);
  });

  it('is news when counted stock comes back from nothing', async () => {
    const { service, run, back } = world({ available: true, stock: '0.000' });
    await run(() => service.update('p1', { stock: 12 } as never));
    expect(back()).toHaveLength(1);
  });

  it('is no news when it was buyable all along, or is switched off, or stays sold out', async () => {
    const onAllAlong = world({ available: true, stock: null });
    await onAllAlong.run(() => onAllAlong.service.setAvailability('p1', true));
    await onAllAlong.run(() => onAllAlong.service.update('p1', { stock: 5 } as never));
    const switchedOff = world({ available: true, stock: '3.000' });
    await switchedOff.run(() => switchedOff.service.setAvailability('p1', false));
    // Switched on, but nothing left to sell: still not on the counter.
    const empty = world({ available: false, stock: '0.000' });
    await empty.run(() => empty.service.setAvailability('p1', true));
    expect([...onAllAlong.back(), ...switchedOff.back(), ...empty.back()]).toEqual([]);
  });
});

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

describe('whoever saved it', () => {
  const backInStock = (): DomainEvent<'product.back_in_stock'> => ({
    id: 'e1',
    name: PRODUCT_EVENT.BACK_IN_STOCK,
    tenantId: TENANT,
    at: new Date('2026-10-05T06:00:00Z'),
    payload: {
      productId: 'p1',
      storeId: 's1',
      name: { ru: 'Помидоры' },
      price: 18_000_00,
      currency: 'UZS',
      imageUrl: null,
    },
  });

  it('hears it once a day, as a promo they may have opted out of', async () => {
    const events = bus();
    const jobs: { payload: Record<string, unknown>; options: { jobId: string } }[] = [];
    registerFavoritesSaleHandlers(events, {
      favorites: { saversOf: async () => ['cust-1', 'cust-2'] },
      queue: {
        async enqueue(
          _queue: string,
          _job: string,
          payload: Record<string, unknown>,
          options: { jobId: string },
        ) {
          jobs.push({ payload, options });
        },
      } as never,
    });
    await events.publish(backInStock());
    expect(jobs.map((j) => j.payload['userId'])).toEqual(['cust-1', 'cust-2']);
    expect(jobs[0]?.payload).toMatchObject({
      template: 'promo.generic',
      deepLink: '/product/p1',
      params: { title: 'Снова в наличии: Помидоры' },
    });
    expect(jobs[0]?.payload).not.toHaveProperty('imageUrl');
    // Its own key: a sale push the same day does not swallow it, a second refill does.
    expect(jobs[0]?.options.jobId).toBe('back:p1:2026-10-05:cust-1');
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
    await events.publish(backInStock());
    expect(jobs).toEqual([]);
  });
});
