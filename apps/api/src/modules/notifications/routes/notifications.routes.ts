/**
 * Notifications route definitions — mounted by src/routes/notifications.routes.ts.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { NotificationsController } from '../controller/notifications.controller.js';
import {
  markReadSchema,
  notificationListQuerySchema,
  preferencesSchema,
  pushTokenSchema,
} from '../schemas/index.js';

export function notificationsRoutes(controller: NotificationsController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Every route here is about the caller's own notifications, so ownership
    // is implicit: the service reads the user from the context.
    app.addHook('preHandler', requireAuth);

    app.get('/', { preHandler: validate({ query: notificationListQuerySchema }) }, controller.list);
    app.get('/unread-count', controller.unreadCount);
    app.post('/read', { preHandler: validate({ body: markReadSchema }) }, controller.markRead);
    app.post('/read-all', controller.markAllRead);

    app.get('/preferences', controller.getPreferences);
    app.patch(
      '/preferences',
      { preHandler: validate({ body: preferencesSchema }) },
      controller.updatePreferences,
    );

    app.post('/telegram-link', controller.telegramLink);

    app.post(
      '/push-tokens',
      { preHandler: validate({ body: pushTokenSchema }) },
      controller.registerPushToken,
    );
  };
}
