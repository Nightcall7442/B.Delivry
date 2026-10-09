/**
 * The API on a real database, driven the way the apps drive it.
 *
 * The app is built in process (no port): the actors use @bazar/api-client — the same calls the
 * customer app, Bazar Seller and the courier app make — with a `fetch` that hands each request to
 * Fastify's `inject`. Redis is left out (its in-memory twins run the queue and the cache), so the
 * courier search and the money handlers run in this process, as they do in a Redis-less dev API.
 *
 * Every run lives in a tenant of its own, with its own city, zone, tariff, stall and courier, so
 * runs never see each other's rows and the database needs no cleaning between them.
 */
import { randomUUID } from 'node:crypto';
import { createApiClient } from '@bazar/api-client';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { buildContainer, createApp, type Container } from '../../src/app/index.js';
import { loadConfig } from '../../src/config/index.js';
import { ConsoleSmsProvider } from '../../src/integrations/sms/providers/console.provider.js';

/**
 * These tests write real rows: they run only against a database named for tests, never the one a
 * developer keeps their local data in. Anything else skips the suite with the reason.
 */
export function testDatabase(): { url: string } | { skip: string } {
  const url = process.env.DATABASE_URL;
  if (url === undefined) return { skip: 'DATABASE_URL is not set' };
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/_(test|e2e)$/.test(name)) {
    return {
      skip: `database «${name}» is not a test database (its name must end in _test or _e2e)`,
    };
  }
  return { url };
}

export interface Api {
  app: FastifyInstance;
  container: Container;
  prisma: PrismaClient;
  close(): Promise<void>;
}

export async function startApi(databaseUrl: string): Promise<Api> {
  const config = loadConfig({
    // Long enough for the env schema; a real environment's own secrets win.
    JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789-0123456789',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789-0123456789',
    SESSION_SECRET: 'e2e-session-secret-0123456789-0123456789',
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    LOG_LEVEL: 'silent',
    SMS_PROVIDER: 'console',
    STORAGE_PROVIDER: 'local',
    MAPS_PROVIDER: 'osm',
    // Nothing listens here: routing falls back to the straight line at once, so prices do not
    // depend on a routing service being up.
    OSRM_BASE_URL: 'http://127.0.0.1:9',
    // Many sign-ins from one address in a few seconds is the test, not an attack.
    RATE_LIMIT_MAX: '100000',
  });
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const container = buildContainer(config, { prisma, withoutRedis: true });
  const app = await createApp(container);
  await app.ready();
  return {
    app,
    container,
    prisma,
    async close() {
      await app.close();
      await container.close();
    },
  };
}

const BASE_URL = 'http://api.test/api/v1';

/** `fetch` that never leaves the process: the request goes straight into Fastify. */
function fetchVia(app: FastifyInstance): typeof fetch {
  return async (input, init = {}) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const res = await app.inject({
      method: (init.method ?? 'GET') as 'GET',
      url: url.pathname + url.search,
      headers,
      ...(init.body === undefined || init.body === null
        ? {}
        : { payload: init.body as string | Buffer }),
    });
    const out = new Headers();
    for (const [key, value] of Object.entries(res.headers)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) out.append(key, String(item));
    }
    const empty = res.statusCode === 204 || res.statusCode === 304;
    return new Response(empty ? null : new Uint8Array(res.rawPayload), {
      status: res.statusCode,
      headers: out,
    });
  };
}

export type Client = ReturnType<typeof createApiClient>;

/** A signed-out app of this tenant: it holds its own tokens, as each app on a phone does. */
export function client(api: Api, tenantSlug: string): Client {
  let tokens: { accessToken: string; refreshToken: string } | null = null;
  return createApiClient({
    baseUrl: BASE_URL,
    tenant: tenantSlug,
    locale: () => 'ru',
    fetch: fetchVia(api.app),
    tokens: { get: () => tokens, set: (next) => void (tokens = next) },
  });
}

/**
 * Signs in by phone the way a person does: asks for a code, reads it off the «SMS» (the console
 * provider keeps what it was asked to send) and types it in.
 */
export async function signIn(api: Api, tenantSlug: string, phone: string): Promise<Client> {
  const app = client(api, tenantSlug);
  await app.auth.requestOtp({ phone, locale: 'ru', channel: 'sms' });
  const sms = ConsoleSmsProvider.recent.find((message) => message.to === phone);
  const code = sms?.text.match(/\d{6}/)?.[0];
  if (code === undefined) throw new Error(`no code was sent to ${phone}`);
  await app.auth.verifyOtp({ phone, code });
  return app;
}

/** Polls until `check` returns something truthy: the courier search and the money run behind. */
export async function waitFor<T>(
  what: string,
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}${last ? `: ${String(last)}` : ''}`);
}

/** Where a world's stall stands and where its customer lives, about 1.6 km apart. */
export interface Place {
  stall: { lat: number; lng: number };
  home: { lat: number; lng: number };
}

/**
 * Delivery zones are reference data, shared by every tenant: a point inside two zones belongs to
 * the one of higher priority, whichever run drew it. So each world stands on its own spot in the
 * Kyzylkum — far from every real zone, a box of 0,06° — and the zones earlier runs left behind are
 * switched off once they are half an hour old (a run still going is never that old).
 */
async function claimPlace(prisma: PrismaClient): Promise<Place> {
  await prisma.deliveryZone.updateMany({
    where: {
      name: { startsWith: 'E2E ' },
      active: true,
      createdAt: { lt: new Date(Date.now() - 30 * 60_000) },
    },
    data: { active: false },
  });
  const lat = 38 + Math.random() * 2;
  const lng = 62 + Math.random() * 3;
  return { stall: { lat, lng }, home: { lat: lat + 0.01, lng: lng + 0.013 } };
}

export interface World {
  place: Place;
  tenantId: string;
  slug: string;
  cityId: string;
  storeId: string;
  vendorPhone: string;
  courierPhone: string;
  customerPhone: string;
  /** Another customer of the same bazaar, with no business in this one's orders. */
  strangerPhone: string;
  /** Sold by weight, 30 000 сум a kilo. */
  meat: { id: string; price: number };
  /** Sold by the piece, 5 000 сум each. */
  bread: { id: string; price: number };
  tariff: { minOrder: number; commissionPercent: number };
}

const phoneFor = (seed: number) => `+99890${String(seed).padStart(7, '0')}`;

/**
 * One bazaar of our own: a city with a zone and a tariff, a vendor with an open stall and two goods,
 * a verified courier. The customer has no account yet — they sign up by signing in.
 */
export async function seedWorld(prisma: PrismaClient): Promise<World> {
  const run = randomUUID().slice(0, 8);
  const seed = Number.parseInt(run, 16) % 1_000_000;
  const slug = `e2e-${run}`;

  const tenant = await prisma.tenant.create({
    data: { slug, name: `E2E ${run}`, defaultLocale: 'ru', settings: { create: {} } },
  });
  const tenantId = tenant.id;

  const city = await prisma.geoPlace.create({
    data: { level: 'CITY', code: `E2E-${run}`, name: { ru: `Город ${run}`, uz: run, en: run } },
  });
  const tariff = { minOrder: 20_000_00, commissionPercent: 10 };
  const tariffRow = await prisma.tariff.create({
    data: {
      name: `E2E ${run}`,
      cityId: city.id,
      base: 8_000_00,
      perKm: 1_500_00,
      freeDistanceMeters: 1_000,
      minFee: 8_000_00,
      maxFee: 50_000_00,
      commissionPercent: tariff.commissionPercent,
      serviceFee: 1_000_00,
      freeDeliveryThreshold: 500_000_00,
      minOrder: tariff.minOrder,
      currency: 'UZS',
    },
  });
  const place = await claimPlace(prisma);
  const { lat, lng } = place.stall;
  await prisma.deliveryZone.create({
    data: {
      name: `E2E ${run}`,
      cityId: city.id,
      tariffId: tariffRow.id,
      // GeoJSON ring, [lng, lat]: a box of about 5 × 7 km around the stall.
      polygon: [
        [
          [lng - 0.03, lat - 0.03],
          [lng + 0.03, lat - 0.03],
          [lng + 0.03, lat + 0.03],
          [lng - 0.03, lat + 0.03],
          [lng - 0.03, lat - 0.03],
        ],
      ],
      priority: 0,
      active: true,
    },
  });
  const category = await prisma.category.create({
    data: { slug: `e2e-${run}`, name: { ru: 'Мясо', uz: 'Goʻsht', en: 'Meat' }, path: run },
  });

  const vendorPhone = phoneFor(seed);
  const courierPhone = phoneFor(seed + 1);
  const customerPhone = phoneFor(seed + 2);
  const strangerPhone = phoneFor(seed + 3);

  const vendorUser = await prisma.user.create({
    data: {
      tenantId,
      phone: vendorPhone,
      firstName: 'Фархад',
      locale: 'ru',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      roles: { create: { role: 'VENDOR' } },
    },
  });
  const vendor = await prisma.vendor.create({
    data: {
      tenantId,
      userId: vendorUser.id,
      legalName: 'ИП Фархад',
      displayName: 'Мясная лавка',
      phone: vendorPhone,
      status: 'ACTIVE',
      verifiedAt: new Date(),
    },
  });
  const store = await prisma.store.create({
    data: {
      tenantId,
      vendorId: vendor.id,
      cityId: city.id,
      type: 'BAZAAR_STALL',
      status: 'ACTIVE',
      slug: `farhad-${run}`,
      name: { ru: 'Мясная лавка «Фархад»', uz: 'Farhod goʻsht doʻkoni', en: 'Farhad meat' },
      lat,
      lng,
      preparationMinutes: 10,
      // Open round the clock: the journey must not depend on the hour the suite runs at.
      schedule: {
        create: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          opensAt: 0,
          closesAt: 1440,
        })),
      },
    },
  });
  const meat = await prisma.product.create({
    data: {
      tenantId,
      storeId: store.id,
      categoryId: category.id,
      slug: 'beef',
      name: { ru: 'Говядина, мякоть', uz: 'Mol goʻshti', en: 'Beef' },
      unit: 'KG',
      price: 30_000_00,
      currency: 'UZS',
      minQuantity: 0.5,
      quantityStep: 0.5,
      available: true,
    },
  });
  const bread = await prisma.product.create({
    data: {
      tenantId,
      storeId: store.id,
      categoryId: category.id,
      slug: 'non',
      name: { ru: 'Лепёшка', uz: 'Non', en: 'Flatbread' },
      unit: 'PCS',
      price: 5_000_00,
      currency: 'UZS',
      minQuantity: 1,
      quantityStep: 1,
      available: true,
    },
  });

  const courierUser = await prisma.user.create({
    data: {
      tenantId,
      phone: courierPhone,
      firstName: 'Бекзод',
      locale: 'ru',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      roles: { create: { role: 'COURIER' } },
    },
  });
  await prisma.courier.create({
    data: {
      tenantId,
      userId: courierUser.id,
      cityId: city.id,
      vehicleType: 'SCOOTER',
      verifiedAt: new Date(),
    },
  });

  return {
    place,
    tenantId,
    slug,
    cityId: city.id,
    storeId: store.id,
    vendorPhone,
    courierPhone,
    customerPhone,
    strangerPhone,
    meat: { id: meat.id, price: 30_000_00 },
    bread: { id: bread.id, price: 5_000_00 },
    tariff,
  };
}
