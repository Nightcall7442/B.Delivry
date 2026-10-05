/**
 * «Индекс базара» over the API: the index of the city asked for, else of the busiest one; a city
 * the caller made up never becomes a cache entry of its own; a shop's shelf is the comparison,
 * never part of the rows' price; and the route is not taken for a product id.
 *
 * Real CatalogService and routes over fakes.
 */
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { registerErrorHandler } from '../../src/middleware/error-handler.middleware.js';
import { CatalogController } from '../../src/modules/catalog/controller/catalog.controller.js';
import { catalogRoutes } from '../../src/modules/catalog/routes/catalog.routes.js';
import { CatalogService } from '../../src/modules/catalog/service/catalog.service.js';

const logger = { error() {}, warn() {}, info() {}, debug() {} };
const events = { async publish() {} };
const TASHKENT = '3f2b8c1e-9d4a-4b7e-8a51-2c6d0e9f1a34';
const URGENCH = '7d1c5a90-2b3e-4f6a-9c8d-0e1f2a3b4c5d';
const MADE_UP = '0b9c3a52-6e1f-4d2a-8b7c-5a4e3d2c1b0a';
const LONG_AGO = new Date('2026-01-01T00:00:00Z');

function spyCache() {
  const entries = new Map<string, unknown>();
  return {
    entries,
    async get(key: string) {
      return entries.get(key) ?? null;
    },
    async set(key: string, value: unknown) {
      entries.set(key, value);
    },
    async del() {},
    async ttl() {
      return 0;
    },
    async invalidateByTag() {},
  };
}

const good = (name: string, price: number, store: { type: string; ownerName: string | null }) => ({
  id: `${name}-${price}`,
  name: { ru: name },
  unit: 'KG',
  price,
  currency: 'UZS',
  storeId: `${store.type}-${price}`,
  createdAt: LONG_AGO,
  store,
  history: [],
});

function service() {
  const cache = spyCache();
  const asked: string[] = [];
  const svc = new CatalogService({
    repository: {
      async indexCities() {
        return [
          { id: TASHKENT, name: { ru: 'Ташкент' } },
          { id: URGENCH, name: { ru: 'Ургенч' } },
        ];
      },
      async indexGoods(cityId: string) {
        asked.push(cityId);
        const stall = { type: 'BAZAAR_STALL', ownerName: 'Фарход-ака' };
        const supermarket = { type: 'SUPERMARKET', ownerName: null };
        return [
          good('Картофель', 9_000_00, stall),
          good('Картофель', 10_000_00, stall),
          good('Картофель', 13_000_00, supermarket),
        ];
      },
    },
    cache,
    logger,
    events,
  } as never);
  return { svc, cache, asked };
}

const ctx = systemContext('t1', 'r1', 'ru');

describe('the index of a city', () => {
  it('is of the city asked for, the rows priced without the shop', async () => {
    const { svc, asked } = service();
    const index = await runWithContext(ctx, () => svc.priceIndex(URGENCH));
    expect(asked).toEqual([URGENCH]);
    expect(index.city?.id).toBe(URGENCH);
    expect(index.cities.map((city) => city.id)).toEqual([TASHKENT, URGENCH]);
    expect(index.items[0]).toMatchObject({
      key: 'potatoes',
      median: 9_500_00,
      stalls: 2,
      shops: 13_000_00,
    });
  });

  it('is the busiest city’s for none or a made-up one, and caches nothing under that id', async () => {
    const { svc, cache, asked } = service();
    expect((await runWithContext(ctx, () => svc.priceIndex(MADE_UP))).city?.id).toBe(TASHKENT);
    expect((await runWithContext(ctx, () => svc.priceIndex())).city?.id).toBe(TASHKENT);
    // The second call is the cached one.
    expect(asked).toEqual([TASHKENT]);
    expect([...cache.entries.keys()].sort()).toEqual([
      'price-index:cities:t1',
      `price-index:t1:${TASHKENT}`,
    ]);
  });
});

describe('GET /catalog/price-index', () => {
  it('is its own route, not a product id, and checks the city id', async () => {
    const app = Fastify();
    registerErrorHandler(app);
    const { svc } = service();
    const controller = new CatalogController(svc, {} as never);
    app.addHook('onRequest', (_request, _reply, done) => runWithContext(ctx, done));
    await app.register(catalogRoutes(controller), { prefix: '/catalog' });
    const ok = await app.inject({ method: 'GET', url: `/catalog/price-index?cityId=${URGENCH}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.city.id).toBe(URGENCH);
    const bad = await app.inject({ method: 'GET', url: '/catalog/price-index?cityId=not-an-id' });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
