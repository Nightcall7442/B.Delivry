/**
 * Registers all route groups under API_PREFIX (/api/v1) + /health + /metrics.
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { cartRoutes } from '../modules/cart/index.js';
import { geoRoutes } from '../modules/geo/index.js';
import { pricingRoutes } from '../modules/pricing/index.js';
import { promotionsRoutes } from '../modules/promotions/index.js';

import { recordDemandSchema } from '../modules/analytics/schemas/index.js';
import { validate } from '../middleware/validation.middleware.js';
import { adminRouteGroup } from './admin.routes.js';
import { authRouteGroup } from './auth.routes.js';
import { couriersRouteGroup } from './couriers.routes.js';
import { customersRouteGroup } from './customers.routes.js';
import { deliveryRouteGroup } from './delivery.routes.js';
import { healthRoutes } from './health.routes.js';
import { notificationsRouteGroup } from './notifications.routes.js';
import { ordersRouteGroup } from './orders.routes.js';
import { paymentsRouteGroup } from './payments.routes.js';
import { productsRouteGroup } from './products.routes.js';
import { reviewsRouteGroup } from './reviews.routes.js';
import { storesRouteGroup } from './stores.routes.js';
import { haggleRoutes } from '../modules/haggle/index.js';
import { subscriptionsRoutes } from '../modules/subscriptions/index.js';
import { supportRouteGroup } from './support.routes.js';
import { trackingRouteGroup } from './tracking.routes.js';
import { usersRouteGroup } from './users.routes.js';
import { vendorsRouteGroup } from './vendors.routes.js';
import { storageRouteGroup, uploadsRouteGroup } from './uploads.routes.js';
import { webhooksRouteGroup } from './webhooks.routes.js';

/**
 * The whole public surface of the API, in one list.
 *
 * Versioning is by prefix: /api/v1 today, and a v2 would be a second
 * registration here rather than a fork of the codebase. Health, metrics and
 * webhooks sit outside the prefix on purpose — probes and payment providers
 * are not API clients and must not move when the version does.
 */
export async function registerRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const prefix = container.config.app.prefix;

  await app.register(healthRoutes(container));
  await app.register(webhooksRouteGroup(container), { prefix: '/webhooks' });
  await app.register(storageRouteGroup(container), { prefix: '/storage' });

  await app.register(
    async (api) => {
      await api.register(authRouteGroup(container), { prefix: '/auth' });
      await api.register(usersRouteGroup(container), { prefix: '/users' });
      await api.register(customersRouteGroup(container), { prefix: '/customers' });
      await api.register(couriersRouteGroup(container), { prefix: '/couriers' });
      await api.register(vendorsRouteGroup(container), { prefix: '/vendors' });

      await api.register(storesRouteGroup(container), { prefix: '/stores' });
      await api.register(productsRouteGroup(container));
      await api.register(cartRoutes(container.controllers.cart), { prefix: '/cart' });

      await api.register(ordersRouteGroup(container), { prefix: '/orders' });
      await api.register(deliveryRouteGroup(container), { prefix: '/delivery' });
      await api.register(trackingRouteGroup(container), { prefix: '/tracking' });
      await api.register(paymentsRouteGroup(container), { prefix: '/payments' });

      await api.register(geoRoutes(container.controllers.geo), { prefix: '/geo' });
      await api.register(haggleRoutes(container.controllers.haggle), { prefix: '/haggle' });
      await api.register(pricingRoutes(container.controllers.pricing), { prefix: '/pricing' });
      await api.register(promotionsRoutes(container.controllers.promotions), {
        prefix: '/promotions',
      });

      await api.register(reviewsRouteGroup(container), { prefix: '/reviews' });
      await api.register(subscriptionsRoutes(container.controllers.subscriptions), {
        prefix: '/subscriptions',
      });
      await api.register(supportRouteGroup(container), { prefix: '/support' });
      await api.register(notificationsRouteGroup(container), { prefix: '/notifications' });
      await api.register(adminRouteGroup(container), { prefix: '/admin' });
      await api.register(uploadsRouteGroup(container), { prefix: '/uploads' });
      // White-label: the brand behind the host a browser opened, before any sign-in.
      api.get('/tenants/current', container.controllers.admin.publicTenant);
      // The shopping-list parser reports what it could not match: demand nobody searched for.
      api.post(
        '/analytics/demand',
        { preHandler: validate({ body: recordDemandSchema }) },
        container.controllers.analytics.recordDemand,
      );
    },
    { prefix },
  );
}
