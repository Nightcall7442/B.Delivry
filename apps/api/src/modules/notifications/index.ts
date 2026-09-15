/**
 * Notifications module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { NotificationsService, render } from './service/notifications.service.js';
export { TelegramBotService, type TelegramUpdate } from './service/telegram-bot.service.js';
export { NotificationsRepository } from './repository/notifications.repository.js';
export { NotificationsController } from './controller/notifications.controller.js';
export { notificationsRoutes } from './routes/notifications.routes.js';
export type {
  NotificationSender,
  SendRequest,
  DirectSendRequest,
  Preferences,
} from './types/index.js';
