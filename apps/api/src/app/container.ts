/**
 * Lightweight dependency wiring (repositories → services → controllers). Keep it simple, no heavy DI framework.
 */
import type { NotificationProvider } from '@bazar/notifications';
import { tashkentParts } from '@bazar/utils/date';
import type { MapProvider } from '@bazar/maps';
import type { PaymentProvider } from '@bazar/payments';
import type { NotificationChannel } from '@bazar/constants';
import type { PrismaClient } from '@prisma/client';
import type { Config } from '../config/index.js';
import { InProcessEventBus, type EventBus } from '../events/event-bus.js';
import { registerEventHandlers } from '../events/handlers/index.js';
import { createLogger, type Logger } from '../infrastructure/logger/index.js';
import { createPrismaClient } from '../infrastructure/database/prisma.client.js';
import {
  BullQueue,
  MemoryCache,
  MemoryRateLimiter,
  RedisCache,
  RedisLock,
  RedisPubSub,
  RedisRateLimiter,
  RedisSessionStore,
  RealtimePublisher,
  createRedis,
  type CacheStore,
  type EnqueueOptions,
  type JobQueue,
  type PubSub,
  type PubSubHandler,
  type RateLimiter,
  type RedisClient,
  type SessionStore,
} from '../infrastructure/redis/index.js';
import { createMapProvider } from '../integrations/maps/index.js';
import { createStorageProvider, type StorageProvider } from '../integrations/storage/index.js';
import { buildJobHandlers } from '../jobs/index.js';
import { createPaymentProviders } from '../integrations/payments/index.js';
import { createNotificationProviders, createTelegramProvider } from '../integrations/index.js';

import {
  AddressesController,
  AddressesRepository,
  AddressesService,
} from '../modules/addresses/index.js';
import { AdminController, AdminRepository, AdminService } from '../modules/admin/index.js';
import {
  AnalyticsController,
  AnalyticsRepository,
  AnalyticsService,
} from '../modules/analytics/index.js';
import { AuditController, AuditRepository, AuditService } from '../modules/audit/index.js';
import {
  AuthController,
  AuthRepository,
  AuthService,
  TokenService,
} from '../modules/auth/index.js';
import { CartController, CartRepository, CartService } from '../modules/cart/index.js';
import { CatalogController, CatalogRepository, CatalogService } from '../modules/catalog/index.js';
import {
  CategoriesController,
  CategoriesRepository,
  CategoriesService,
} from '../modules/categories/index.js';
import {
  CouriersController,
  CouriersRepository,
  CouriersService,
} from '../modules/couriers/index.js';
import {
  CustomersController,
  CustomersRepository,
  CustomersService,
} from '../modules/customers/index.js';
import {
  DeliveryController,
  DeliveryRepository,
  DeliveryService,
} from '../modules/delivery/index.js';
import { GeoController, GeoRepository, GeoService } from '../modules/geo/index.js';
import { HaggleController, HaggleService } from '../modules/haggle/index.js';
import {
  NotificationsController,
  NotificationsRepository,
  NotificationsService,
  TelegramBotService,
} from '../modules/notifications/index.js';
import { OrdersController, OrdersRepository, OrdersService } from '../modules/orders/index.js';
import {
  PaymentsController,
  PaymentsRepository,
  PaymentsService,
  ClickShopApi,
  PaymeMerchantApi,
} from '../modules/payments/index.js';
import { PricingController, PricingRepository, PricingService } from '../modules/pricing/index.js';
import {
  ProductsController,
  ProductsRepository,
  ProductsService,
} from '../modules/products/index.js';
import {
  PromotionsController,
  PromotionsRepository,
  PromotionsService,
} from '../modules/promotions/index.js';
import { ReviewsController, ReviewsRepository, ReviewsService } from '../modules/reviews/index.js';
import { StoresController, StoresRepository, StoresService } from '../modules/stores/index.js';
import {
  SubscriptionsController,
  SubscriptionsRepository,
  SubscriptionsService,
} from '../modules/subscriptions/index.js';
import { SupportController, SupportRepository, SupportService } from '../modules/support/index.js';
import {
  RouteEtaCalculator,
  TrackingController,
  TrackingRepository,
  TrackingService,
} from '../modules/tracking/index.js';
import { UsersController, UsersRepository, UsersService } from '../modules/users/index.js';
import { VendorsController, VendorsRepository, VendorsService } from '../modules/vendors/index.js';

/**
 * Everything the app is made of, constructed once at boot in dependency order.
 *
 * Hand-written on purpose: a DI framework would hide exactly the thing this
 * file is for — seeing, in one place, what depends on what. Ninety lines of
 * `new` beats a container that has to be debugged.
 */
export interface Container {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
  redis: RedisClient | null;
  cache: CacheStore;
  limiter: RateLimiter;
  sessions: SessionStore;
  queue: JobQueue;
  events: EventBus;
  realtime: RealtimePublisher;
  /** The websocket gateway subscribes here for cross-instance fan-out. */
  pubsub: PubSub;
  lock: RedisLock | null;
  maps: MapProvider;
  storage: StorageProvider;

  services: {
    admin: AdminService;
    addresses: AddressesService;
    analytics: AnalyticsService;
    audit: AuditService;
    auth: AuthService;
    cart: CartService;
    catalog: CatalogService;
    categories: CategoriesService;
    couriers: CouriersService;
    customers: CustomersService;
    delivery: DeliveryService;
    geo: GeoService;
    haggle: HaggleService;
    notifications: NotificationsService;
    telegramBot: TelegramBotService;
    orders: OrdersService;
    payments: PaymentsService;
    pricing: PricingService;
    products: ProductsService;
    promotions: PromotionsService;
    reviews: ReviewsService;
    stores: StoresService;
    subscriptions: SubscriptionsService;
    support: SupportService;
    tokens: TokenService;
    tracking: TrackingService;
    users: UsersService;
    vendors: VendorsService;
  };

  controllers: {
    addresses: AddressesController;
    admin: AdminController;
    analytics: AnalyticsController;
    audit: AuditController;
    auth: AuthController;
    cart: CartController;
    catalog: CatalogController;
    categories: CategoriesController;
    couriers: CouriersController;
    customers: CustomersController;
    delivery: DeliveryController;
    geo: GeoController;
    haggle: HaggleController;
    notifications: NotificationsController;
    orders: OrdersController;
    payments: PaymentsController;
    pricing: PricingController;
    products: ProductsController;
    promotions: PromotionsController;
    reviews: ReviewsController;
    stores: StoresController;
    subscriptions: SubscriptionsController;
    support: SupportController;
    tracking: TrackingController;
    users: UsersController;
    vendors: VendorsController;
  };

  close(): Promise<void>;
}

export interface BuildOptions {
  /** Tests pass their own client; production lets the container make one. */
  prisma?: PrismaClient;
  /** Skips Redis entirely: in-memory cache, limiter and sessions instead. */
  withoutRedis?: boolean;
}

export function buildContainer(config: Config, options: BuildOptions = {}): Container {
  const logger = createLogger(config.app);
  const prisma = options.prisma ?? createPrismaClient({ config: config.database, logger });

  // Redis is optional so the API can boot for tests and local work without it.
  // Everything backed by Redis has an in-memory twin; only realtime fan-out
  // across instances genuinely needs it.
  const redisUrl = options.withoutRedis === true ? undefined : config.redis.url;
  const redis = redisUrl
    ? createRedis({ ...config.redis, url: redisUrl }, logger, 'commands')
    : null;
  const subscriber = redisUrl
    ? createRedis({ ...config.redis, url: redisUrl }, logger, 'subscriber')
    : null;
  const queueConnection = redisUrl
    ? createRedis({ ...config.redis, url: redisUrl }, logger, 'queue')
    : null;
  if (!redisUrl)
    logger.warn('REDIS_URL is not set: running with in-memory cache, sessions, limiter and queue');

  const cache: CacheStore =
    redis === null ? new MemoryCache() : new RedisCache(redis, config.redis);
  const limiter: RateLimiter =
    redis === null ? new MemoryRateLimiter() : new RedisRateLimiter(redis, config.redis);
  const sessions: SessionStore =
    redis === null ? new MemorySessionStoreFallback() : new RedisSessionStore(redis, config.redis);
  const lock = redis === null ? null : new RedisLock(redis, config.redis);

  const pubsub: PubSub =
    redis === null || subscriber === null
      ? new MemoryPubSub()
      : new RedisPubSub(redis, subscriber, config.redis, logger);
  const realtime = new RealtimePublisher(pubsub);

  const events: EventBus = new InProcessEventBus(logger);
  const queue: JobQueue =
    queueConnection === null
      ? new MemoryQueue(logger)
      : new BullQueue(queueConnection, config.redis, logger);

  const deps = { logger, events };

  const maps = createMapProvider(config.maps, logger);
  const storage = createStorageProvider(config.storage, logger);

  // ---------------------------------------------------------------- repositories
  const repositories = {
    addresses: new AddressesRepository(prisma),
    admin: new AdminRepository(prisma),
    analytics: new AnalyticsRepository(prisma),
    audit: new AuditRepository(prisma),
    auth: new AuthRepository(prisma),
    cart: new CartRepository(prisma),
    catalog: new CatalogRepository(prisma),
    categories: new CategoriesRepository(prisma),
    couriers: new CouriersRepository(prisma),
    customers: new CustomersRepository(prisma),
    delivery: new DeliveryRepository(prisma),
    geo: new GeoRepository(prisma),
    notifications: new NotificationsRepository(prisma),
    orders: new OrdersRepository(prisma),
    payments: new PaymentsRepository(prisma),
    pricing: new PricingRepository(prisma),
    products: new ProductsRepository(prisma),
    promotions: new PromotionsRepository(prisma),
    reviews: new ReviewsRepository(prisma),
    stores: new StoresRepository(prisma),
    subscriptions: new SubscriptionsRepository(prisma),
    support: new SupportRepository(prisma),
    tracking: new TrackingRepository(prisma),
    users: new UsersRepository(prisma),
    vendors: new VendorsRepository(prisma),
  };

  // ---------------------------------------------------------------- services
  const telegram = createTelegramProvider(config.notifications, logger);
  const notificationProviders: Map<NotificationChannel, NotificationProvider> =
    createNotificationProviders(config.notifications, logger, telegram);
  const telegramBot = new TelegramBotService({
    repository: repositories.notifications,
    telegram,
    config: config.notifications.telegram,
    logger,
  });

  const notifications = new NotificationsService({
    ...deps,
    repository: repositories.notifications,
    providers: notificationProviders,
  });

  const tokens = new TokenService(config.auth, repositories.auth, sessions);
  const auth = new AuthService({
    ...deps,
    config: config.auth,
    repository: repositories.auth,
    tokens,
    sessions,
    notifications,
  });

  const audit = new AuditService(deps, repositories.audit);
  const admin = new AdminService({ ...deps, repository: repositories.admin, cache });
  const geo = new GeoService({ ...deps, repository: repositories.geo, cache, maps });
  const pricing = new PricingService({ ...deps, repository: repositories.pricing, geo, maps });
  const stores = new StoresService({ ...deps, repository: repositories.stores, prisma, queue });
  const catalog = new CatalogService({ ...deps, repository: repositories.catalog, cache });
  const categories = new CategoriesService({ ...deps, repository: repositories.categories, cache });
  const products = new ProductsService({
    ...deps,
    repository: repositories.products,
    stores,
    cache,
  });
  const cart = new CartService({ ...deps, repository: repositories.cart, catalog });
  const addresses = new AddressesService({ ...deps, repository: repositories.addresses, geo });
  const promotions = new PromotionsService({ ...deps, repository: repositories.promotions });
  const customers = new CustomersService({ ...deps, repository: repositories.customers });
  const vendors = new VendorsService({ ...deps, repository: repositories.vendors });
  const users = new UsersService({ ...deps, repository: repositories.users, auth });

  const haggle = new HaggleService({ ...deps, prisma, queue, realtime });
  const orders = new OrdersService({
    ...deps,
    prisma,
    repository: repositories.orders,
    cart,
    catalog,
    stores,
    addresses,
    pricing,
    promotions,
    haggle,
    autoConfirm: (tenantId) => admin.autoConfirm(tenantId),
  });

  const paymentProviders: Map<string, PaymentProvider> = createPaymentProviders(
    config.payments,
    logger,
  );

  const payments = new PaymentsService({
    ...deps,
    prisma,
    repository: repositories.payments,
    orders,
    providers: paymentProviders,
    defaultProvider: config.payments.defaultProvider,
  });

  const delivery = new DeliveryService({
    ...deps,
    repository: repositories.delivery,
    orders,
    pricing,
    // Without Redis there is only one instance, so an in-process guard is
    // enough to keep two requests from claiming the same delivery.
    lock: lock ?? new RedisLock(new InMemoryRedisStub() as unknown as RedisClient, config.redis),
  });

  const tracking = new TrackingService({
    ...deps,
    repository: repositories.tracking,
    orders,
    delivery,
    realtime,
    eta: new RouteEtaCalculator(maps),
  });

  const couriers = new CouriersService({
    ...deps,
    repository: repositories.couriers,
    delivery,
    payments,
  });

  const reviews = new ReviewsService({
    ...deps,
    repository: repositories.reviews,
    orders,
    stores,
    couriers,
  });

  const support = new SupportService({ ...deps, repository: repositories.support, notifications });
  const subscriptions = new SubscriptionsService({
    ...deps,
    repository: repositories.subscriptions,
    orders,
    catalog,
    stores,
    addresses,
    notifications,
  });
  const analytics = new AnalyticsService({ ...deps, repository: repositories.analytics, cache });

  const services = {
    addresses,
    admin,
    analytics,
    audit,
    auth,
    cart,
    catalog,
    categories,
    couriers,
    customers,
    delivery,
    geo,
    haggle,
    notifications,
    orders,
    payments,
    pricing,
    telegramBot,
    products,
    promotions,
    reviews,
    stores,
    subscriptions,
    support,
    tokens,
    tracking,
    users,
    vendors,
  };

  // ---------------------------------------------------------------- controllers
  const controllers = {
    addresses: new AddressesController(addresses),
    admin: new AdminController(admin),
    analytics: new AnalyticsController(analytics),
    audit: new AuditController(audit),
    auth: new AuthController(auth),
    cart: new CartController(cart),
    catalog: new CatalogController(catalog, analytics),
    categories: new CategoriesController(categories),
    couriers: new CouriersController(couriers),
    customers: new CustomersController(customers),
    delivery: new DeliveryController(delivery),
    geo: new GeoController(geo),
    haggle: new HaggleController(haggle),
    notifications: new NotificationsController(notifications, telegramBot),
    orders: new OrdersController(orders, payments),
    payments: new PaymentsController(
      payments,
      config.payments.payme === undefined
        ? undefined
        : new PaymeMerchantApi({ repository: repositories.payments, payments, logger }),
      config.payments.payme?.secretKey,
      config.payments.click === undefined
        ? undefined
        : new ClickShopApi({
            repository: repositories.payments,
            payments,
            logger,
            settings: config.payments.click,
          }),
    ),
    pricing: new PricingController(pricing),
    products: new ProductsController(products),
    promotions: new PromotionsController(promotions),
    reviews: new ReviewsController(reviews),
    stores: new StoresController(stores),
    subscriptions: new SubscriptionsController(subscriptions),
    support: new SupportController(support),
    tracking: new TrackingController(tracking),
    users: new UsersController(users),
    vendors: new VendorsController(vendors),
  };

  // Wiring the reactions last, once every service exists.
  registerEventHandlers({
    events,
    queue,
    realtime,
    audit,
    autoAssign: (tenantId) => admin.autoAssign(tenantId),
    stats: { couriers, customers },
    paymentSync: { orders, payments },
    guarantee: { orders, payments, queue },
    perks: { customers, couriers, orders, payments, stores, queue },
    recipient: { orders, notifications },
    delivery,
  });

  const container: Container = {
    config,
    logger,
    prisma,
    redis,
    cache,
    limiter,
    sessions,
    queue,
    events,
    realtime,
    pubsub,
    lock,
    maps,
    storage,
    services,
    controllers,
    async close() {
      await queue.close();
      await pubsub.close();
      await Promise.all(
        [redis, subscriber, queueConnection]
          .filter((client): client is RedisClient => client !== null)
          .map((client) => client.quit()),
      );
      await prisma.$disconnect();
    },
  };

  if (queue instanceof MemoryQueue) queue.bind(buildJobHandlers(container));

  return container;
}

/** Stand-ins used when the API runs without Redis. */
class MemoryPubSub implements PubSub {
  // Single instance, so "fan-out" is a local dispatch: the gateway subscribes
  // here and the publisher's events reach this process's sockets. The JSON
  // round trip keeps handlers from sharing a mutable payload with the caller.
  private readonly handlers = new Map<string, Set<PubSubHandler>>();
  async publish(channel: string, payload: unknown): Promise<void> {
    const handlers = this.handlers.get(channel);
    if (handlers === undefined) return;
    const copy: unknown = JSON.parse(JSON.stringify(payload));
    for (const handler of handlers) handler(copy, channel);
  }
  async subscribe(channel: string, handler: PubSubHandler): Promise<void> {
    const existing = this.handlers.get(channel) ?? new Set<PubSubHandler>();
    existing.add(handler);
    this.handlers.set(channel, existing);
  }
  async unsubscribe(channel: string): Promise<void> {
    this.handlers.delete(channel);
  }
  async close(): Promise<void> {
    this.handlers.clear();
  }
}

/**
 * setTimeout-backed queue for a Redis-less run: jobs run in this process
 * after their delay, so a dev order still gets its courier search, ETA
 * refresh and notifications. Handlers are bound after the container exists
 * because they need it. Not durable: a restart drops pending jobs.
 */
class MemoryQueue implements JobQueue {
  private handlers = new Map<string, (payload: never) => Promise<void>>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly pending = new Set<string>();

  constructor(private readonly logger: Logger) {}

  bind(handlers: Map<string, (payload: never) => Promise<void>>): void {
    this.handlers = handlers;
  }

  async enqueue<T>(
    queueName: string,
    name: string,
    payload: T,
    options?: EnqueueOptions,
  ): Promise<void> {
    const handler = this.handlers.get(name);
    if (handler === undefined) {
      this.logger.warn({ queue: queueName, name }, 'no handler for job');
      return;
    }
    // Same jobId twice = one job, like BullMQ; otherwise a confirm and a
    // status change would each start their own courier search.
    const id = options?.jobId;
    if (id !== undefined) {
      if (this.pending.has(id)) return;
      this.pending.add(id);
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (id !== undefined) this.pending.delete(id);
      void handler(payload as never).catch((error: unknown) => {
        this.logger.error({ err: error, queue: queueName, name }, 'job failed');
      });
    }, options?.delayMs ?? 0);
    this.timers.add(timer);
  }

  private readonly schedules: {
    queueName: string;
    name: string;
    payload: unknown;
    fields: string[];
    lastMinute: number;
  }[] = [];
  private ticker: ReturnType<typeof setInterval> | null = null;

  /**
   * Cron without BullMQ: five fields (`*`, `n`, `a,b`, `*` + `/n`), matched every
   * half minute against Tashkent wall-clock time, one run per matching minute.
   */
  async schedule<T>(queueName: string, name: string, payload: T, cron: string): Promise<void> {
    this.schedules.push({
      queueName,
      name,
      payload,
      fields: cron.trim().split(/\s+/),
      lastMinute: -1,
    });
    this.ticker ??= setInterval(() => this.tick(), 30_000);
    this.ticker.unref?.();
  }

  private tick(): void {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    const parts = tashkentParts(now);
    const clock = [parts.minute, parts.hour, parts.day, parts.month, parts.weekday];
    for (const entry of this.schedules) {
      if (entry.lastMinute === minute) continue;
      if (!entry.fields.every((field, i) => cronFieldMatches(field, clock[i] ?? 0))) continue;
      entry.lastMinute = minute;
      void this.enqueue(entry.queueName, entry.name, entry.payload);
    }
  }

  async close(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    if (this.ticker !== null) clearInterval(this.ticker);
  }
}

const cronFieldMatches = (field: string, value: number): boolean =>
  field.split(',').some((part) => {
    if (part === '*') return true;
    if (part.startsWith('*/')) return value % Number(part.slice(2)) === 0;
    return Number(part) === value;
  });

class MemorySessionStoreFallback implements SessionStore {
  private readonly revoked = new Set<string>();
  async revoke(sessionId: string): Promise<void> {
    this.revoked.add(sessionId);
  }
  async isRevoked(sessionId: string): Promise<boolean> {
    return this.revoked.has(sessionId);
  }
  async revokeAllForUser(_userId: string, sessionIds: string[]): Promise<void> {
    for (const id of sessionIds) this.revoked.add(id);
  }
  async touch(): Promise<void> {}
}

/** Single-instance lock: SET NX semantics against a Map. */
class InMemoryRedisStub {
  private readonly keys = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, _px: string, ttlMs: number, _nx: string) {
    const existing = this.keys.get(key);
    if (existing !== undefined && existing.expiresAt > Date.now()) return null;
    this.keys.set(key, { value, expiresAt: Date.now() + ttlMs });
    return 'OK';
  }

  async eval(_script: string, _numKeys: number, key: string, token: string) {
    if (this.keys.get(key)?.value === token) this.keys.delete(key);
    return 1;
  }
}
