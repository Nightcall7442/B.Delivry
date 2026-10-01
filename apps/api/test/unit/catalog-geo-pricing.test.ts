/**
 * The reference data and the price list. Geo and pricing writes are the platform's (`geo:write`,
 * `pricing:write`: admins only) and must stay that way at the route and in the service; a tariff
 * read had only the route to lean on; the public lists put an anonymous caller's query string into
 * a cache key (one entry, and one tag member, per random id for an hour); and the `root` flag of
 * the category queries was `z.coerce.boolean()`, so `?root=false` asked for the top level.
 */
import { effectivePermissions } from '@bazar/auth';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { registerErrorHandler } from '../../src/middleware/error-handler.middleware.js';
import { parseOrThrow } from '../../src/middleware/validation.middleware.js';
import { CatalogController } from '../../src/modules/catalog/controller/catalog.controller.js';
import { categoryListQuerySchema } from '../../src/modules/catalog/schemas/index.js';
import { CatalogService } from '../../src/modules/catalog/service/catalog.service.js';
import { childrenQuerySchema } from '../../src/modules/categories/schemas/index.js';
import { GeoService } from '../../src/modules/geo/service/geo.service.js';
import { geoRoutes } from '../../src/modules/geo/routes/geo.routes.js';
import { PricingService } from '../../src/modules/pricing/service/pricing.service.js';
import { pricingRoutes } from '../../src/modules/pricing/routes/pricing.routes.js';
import { productsRoutes } from '../../src/modules/products/routes/products.routes.js';
import { storesRoutes } from '../../src/modules/stores/routes/stores.routes.js';

const T = 't1';
const ID = '3f2b8c1e-9d4a-4b7e-8a51-2c6d0e9f1a34';
const OTHER_ID = '7d1c5a90-2b3e-4f6a-9c8d-0e1f2a3b4c5d';

const user = (roles: string[], ids: Record<string, string> = {}) => ({
  id: `user-${roles.join('-')}`,
  tenantId: T,
  roles,
  permissions: effectivePermissions(roles as never),
  sessionId: 's1',
  locale: 'ru',
  ...ids,
});

const as = (roles: string[], ids: Record<string, string> = {}) =>
  ({ ...systemContext(T, 'r1', 'ru'), system: undefined, user: user(roles, ids) }) as never;

const anonymous = { ...systemContext(T, 'r1', 'ru'), system: undefined, user: null } as never;
const customer = as(['CUSTOMER'], { customerId: 'cust-1' });
const vendor = as(['VENDOR'], { vendorId: 'vendor-a' });
const operator = as(['OPERATOR']);
const admin = as(['ADMIN']);

const logger = { error() {}, warn() {}, info() {}, debug() {} };
const events = { async publish() {} };

/** A cache that remembers what was put into it. */
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

// ================================================================ the `root` flag

describe('?root= on the category queries', () => {
  it('reads false as false, on /catalog/categories and /categories/children', () => {
    for (const schema of [categoryListQuerySchema, childrenQuerySchema]) {
      expect(parseOrThrow(schema, { root: 'false' }).root).toBe(false);
      expect(parseOrThrow(schema, { root: '0' }).root).toBe(false);
      expect(parseOrThrow(schema, { root: 'true' }).root).toBe(true);
      expect(parseOrThrow(schema, { root: '1' }).root).toBe(true);
      expect(parseOrThrow(schema, {}).root).toBeUndefined();
    }
  });

  it('refuses a flag it cannot read, with the field named', () => {
    for (const schema of [categoryListQuerySchema, childrenQuerySchema]) {
      expect(() => parseOrThrow(schema, { root: 'maybe' })).toThrow('Validation failed');
    }
  });

  it('keeps the children of a parent when the flag says it is not the root', async () => {
    const asked: unknown[] = [];
    const controller = new CatalogController(
      {
        async categories(parentId: unknown) {
          asked.push(parentId);
          return [];
        },
      } as never,
      {} as never,
    );
    const call = (query: Record<string, unknown>) =>
      controller.categories(
        { query: parseOrThrow(categoryListQuerySchema, query) } as never,
        {} as never,
      );
    await call({ parentId: ID, root: 'false' });
    await call({ root: 'true' });
    expect(asked).toEqual([ID, null]);
  });
});

// ================================================================ public lists vs. the cache

describe('public lists do not write the caller’s ids into the cache', () => {
  it('catalog categories: an unknown parent answers empty and leaves no entry', async () => {
    const cache = spyCache();
    let listed = 0;
    const service = new CatalogService({
      repository: {
        async categoryExists(id: string) {
          return id === ID;
        },
        async listCategories() {
          listed += 1;
          return [{ id: 'c1' }];
        },
      },
      cache,
      logger,
      events,
    } as never);
    expect(await runWithContext(anonymous, () => service.categories(OTHER_ID))).toEqual([]);
    expect(cache.entries.size).toBe(0);
    expect(listed).toBe(0);
    // The top level and a real parent are cached as before.
    expect(await runWithContext(anonymous, () => service.categories(null))).toHaveLength(1);
    expect(await runWithContext(anonymous, () => service.categories(ID))).toHaveLength(1);
    expect([...cache.entries.keys()].sort()).toEqual([`categories:${ID}`, 'categories:root']);
  });

  const geo = () => {
    const cache = spyCache();
    const service = new GeoService({
      repository: {
        async findPlace(id: string) {
          return id === ID ? { id, level: 'CITY' } : null;
        },
        async listPlaces() {
          return [{ id: 'p1' }];
        },
        async listZones() {
          return [{ id: 'z1', polygon: { type: 'Polygon', coordinates: [] } }];
        },
      },
      cache,
      maps: {},
      logger,
      events,
    } as never);
    return { service, cache };
  };

  it('geo places: an unknown parent answers empty and leaves no entry', async () => {
    const { service, cache } = geo();
    expect(await runWithContext(anonymous, () => service.listPlaces(undefined, OTHER_ID))).toEqual(
      [],
    );
    expect(cache.entries.size).toBe(0);
    expect(await runWithContext(anonymous, () => service.listPlaces(undefined, ID))).toHaveLength(
      1,
    );
    expect(await runWithContext(anonymous, () => service.listCities())).toHaveLength(1);
    expect(cache.entries.size).toBe(2);
  });

  it('geo zones: an unknown city answers empty and leaves no entry', async () => {
    const { service, cache } = geo();
    expect(await runWithContext(anonymous, () => service.listZones(OTHER_ID))).toEqual([]);
    expect(cache.entries.size).toBe(0);
    expect(await runWithContext(anonymous, () => service.listZones(ID))).toHaveLength(1);
    expect([...cache.entries.keys()]).toEqual([`zones:${ID}`]);
  });

  it('checkout still resolves through a city it knows, without the public check', async () => {
    const { service } = geo();
    const resolution = await runWithContext(anonymous, () =>
      service.resolveZone({ lat: 41.5, lng: 60.6 }, OTHER_ID),
    );
    expect(resolution.deliverable).toBe(false);
  });
});

// ================================================================ the services

describe('geo and pricing writes are the admin’s', () => {
  const geo = () =>
    new GeoService({
      repository: {
        async createZone() {
          return { id: 'z' };
        },
        async updateZone() {
          return { id: 'z' };
        },
        async deleteZone() {},
        async createPlace() {
          return { id: 'p' };
        },
      },
      cache: spyCache(),
      maps: {},
      logger,
      events,
    } as never);

  const pricing = () =>
    new PricingService({
      repository: {
        async findTariff(id: string) {
          return { id, name: 'Base' };
        },
        async listTariffs() {
          return { items: [], pagination: {} };
        },
        async createTariff() {
          return { id: 't' };
        },
        async updateTariff() {
          return { id: 't' };
        },
        async createSurgeRule() {
          return { id: 's' };
        },
        async deleteSurgeRule() {},
      },
      geo: {},
      maps: {},
      logger,
      events,
    } as never);

  const geoWrites = (service: GeoService): (() => Promise<unknown>)[] => [
    () => service.createPlace({ level: 'CITY', code: 'x', name: { ru: 'x' } } as never),
    () => service.createZone({ name: 'x', cityId: ID, polygon: [], tariffId: ID }),
    () => service.updateZone(ID, { name: 'y' }),
    () => service.deleteZone(ID),
  ];

  const pricingCalls = (service: PricingService): (() => Promise<unknown>)[] => [
    () => service.getTariff(ID),
    () => service.listTariffs({}),
    () => service.createTariff({} as never),
    () => service.updateTariff(ID, {}),
    () => service.createSurgeRule({} as never),
    () => service.deleteSurgeRule(ID),
  ];

  it('lets the admin through', async () => {
    for (const call of geoWrites(geo())) await runWithContext(admin, call);
    for (const call of pricingCalls(pricing())) await runWithContext(admin, call);
  });

  it('refuses everyone else, vendors and operators included', async () => {
    for (const who of [vendor, customer, operator]) {
      for (const call of geoWrites(geo())) {
        await expect(runWithContext(who, call)).rejects.toBeInstanceOf(ForbiddenError);
      }
      for (const call of pricingCalls(pricing())) {
        await expect(runWithContext(who, call)).rejects.toBeInstanceOf(ForbiddenError);
      }
    }
    for (const call of [...geoWrites(geo()), ...pricingCalls(pricing())]) {
      await expect(runWithContext(anonymous, call)).rejects.toBeInstanceOf(UnauthorizedError);
    }
  });

  it('keeps the tariff read behind pricing:write in the service as well as at the route', async () => {
    // `GET /pricing/tariffs/:id` named no permission below the route: a handler reached some other
    // way (a job, a second route) would have handed the price list to any caller.
    await expect(runWithContext(vendor, () => pricing().getTariff(ID))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await runWithContext(admin, () => pricing().getTariff(ID))).toMatchObject({ id: ID });
    // The platform's own jobs read it freely.
    expect(
      await runWithContext(systemContext(T, 'job', 'ru'), () => pricing().getTariff(ID)),
    ).toMatchObject({ id: ID });
  });
});

// ================================================================ the routes

/** A server with the module's real routes and guards, and controllers that just say "ok". */
async function server(register: (app: FastifyInstance) => Promise<void>, prefix: string) {
  const app = Fastify();
  registerErrorHandler(app);
  app.addHook('onRequest', async (request) => {
    const header = request.headers['x-test-roles'];
    if (typeof header === 'string') {
      const [roles, vendorId] = header.split('@');
      request.user = user(roles!.split(','), vendorId === undefined ? {} : { vendorId }) as never;
    }
  });
  await app.register(register, { prefix });
  return app;
}

const everything = new Proxy({}, { get: () => async () => ({ ok: true }) }) as never;

const status = async (
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  roles?: string,
): Promise<number> => {
  const response = await app.inject({
    method,
    url,
    ...(method === 'GET' || method === 'DELETE' ? {} : { payload: {} }),
    ...(roles === undefined ? {} : { headers: { 'x-test-roles': roles } }),
  });
  return response.statusCode;
};

describe('the routes keep their guards', () => {
  it('geo: reference data is public, zone writes are for geo:write', async () => {
    const app = await server(geoRoutes(everything), '/geo');
    for (const url of ['/geo/cities', '/geo/places', `/geo/zones?cityId=${ID}`]) {
      expect(await status(app, 'GET', url), url).toBe(200);
    }
    // The paid lookups need an account.
    expect(await status(app, 'GET', '/geo/geocode?query=abc')).toBe(401);
    for (const [method, url] of [
      ['POST', '/geo/zones'],
      ['PATCH', `/geo/zones/${ID}`],
      ['DELETE', `/geo/zones/${ID}`],
    ] as const) {
      expect(await status(app, method, url), `${method} ${url} anonymous`).toBe(401);
      for (const roles of ['CUSTOMER', 'COURIER', 'VENDOR@vendor-a', 'OPERATOR']) {
        expect(await status(app, method, url, roles), `${method} ${url} ${roles}`).toBe(403);
      }
    }
    expect(await status(app, 'DELETE', `/geo/zones/${ID}`, 'ADMIN')).toBe(200);
  });

  it('pricing: the whole price list is for pricing:write', async () => {
    const app = await server(pricingRoutes(everything), '/pricing');
    const routes = [
      ['GET', '/pricing/tariffs'],
      ['GET', `/pricing/tariffs/${ID}`],
      ['POST', '/pricing/tariffs'],
      ['PATCH', `/pricing/tariffs/${ID}`],
      ['POST', '/pricing/surge-rules'],
      ['DELETE', `/pricing/surge-rules/${ID}`],
    ] as const;
    for (const [method, url] of routes) {
      expect(await status(app, method, url), `${method} ${url} anonymous`).toBe(401);
      for (const roles of ['CUSTOMER', 'COURIER', 'VENDOR@vendor-a', 'OPERATOR']) {
        expect(await status(app, method, url, roles), `${method} ${url} ${roles}`).toBe(403);
      }
    }
    expect(await status(app, 'GET', '/pricing/tariffs', 'ADMIN')).toBe(200);
    expect(await status(app, 'GET', `/pricing/tariffs/${ID}`, 'ADMIN')).toBe(200);
  });

  it('products: signed in to read, product:write for the price history', async () => {
    const app = await server(productsRoutes(everything), '/products');
    expect(await status(app, 'GET', '/products')).toBe(401);
    expect(await status(app, 'GET', `/products/${ID}`)).toBe(401);
    expect(await status(app, 'GET', '/products', 'CUSTOMER')).toBe(200);
    expect(await status(app, 'GET', `/products/${ID}`, 'CUSTOMER')).toBe(200);
    const history = `/products/${ID}/price-history`;
    for (const roles of ['CUSTOMER', 'COURIER', 'OPERATOR']) {
      expect(await status(app, 'GET', history, roles), roles).toBe(403);
    }
    expect(await status(app, 'GET', history, 'VENDOR@vendor-a')).toBe(200);
    expect(await status(app, 'GET', history, 'ADMIN')).toBe(200);
  });

  it('stores: the window is public, everything that writes is not', async () => {
    const app = await server(storesRoutes(everything), '/stores');
    expect(await status(app, 'GET', '/stores')).toBe(200);
    expect(await status(app, 'GET', `/stores/${ID}`)).toBe(200);
    for (const [method, url] of [
      ['POST', `/stores/${ID}/arrivals`],
      ['POST', `/stores/${ID}/products/import`],
      ['GET', `/stores/${ID}/report`],
      ['POST', '/stores'],
      ['PATCH', `/stores/${ID}`],
      ['PUT', `/stores/${ID}/schedule`],
      ['DELETE', `/stores/${ID}`],
    ] as const) {
      expect(await status(app, method, url), `${method} ${url}`).toBe(401);
    }
    for (const [method, url] of [
      ['POST', '/stores'],
      ['PATCH', `/stores/${ID}`],
      ['PUT', `/stores/${ID}/schedule`],
      ['DELETE', `/stores/${ID}`],
    ] as const) {
      expect(await status(app, method, url, 'CUSTOMER'), `${method} ${url}`).toBe(403);
    }
  });
});
