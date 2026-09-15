/**
 * Notifications HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, query } from '../../../middleware/validation.middleware.js';
import type { NotificationsService } from '../service/notifications.service.js';
import type { TelegramBotService } from '../service/telegram-bot.service.js';
import type { NotificationListQuery, PreferencesInput, PushTokenInput } from '../schemas/index.js';

export class NotificationsController extends BaseController {
  constructor(
    private readonly service: NotificationsService,
    private readonly bot: TelegramBotService,
  ) {
    super();
  }

  telegramLink = async (request: FastifyRequest, reply: FastifyReply) => {
    return this.ok(reply, await this.bot.issueLink(this.context(request)));
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = query<NotificationListQuery>(request);
    return this.paginated(reply, await this.service.list(input));
  };

  unreadCount = async (_request: FastifyRequest, reply: FastifyReply) => {
    return this.ok(reply, { count: await this.service.unreadCount() });
  };

  markRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const { ids } = body<{ ids: string[] }>(request);
    return this.ok(reply, { updated: await this.service.markRead(ids) });
  };

  markAllRead = async (_request: FastifyRequest, reply: FastifyReply) => {
    return this.ok(reply, { updated: await this.service.markAllRead() });
  };

  getPreferences = async (_request: FastifyRequest, reply: FastifyReply) => {
    return this.ok(reply, await this.service.getPreferences());
  };

  updatePreferences = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<PreferencesInput>(request);
    return this.ok(reply, await this.service.updatePreferences(input));
  };

  registerPushToken = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<PushTokenInput>(request);
    await this.service.registerPushToken(input.token, input.platform, input.deviceId);
    this.noContent(reply);
  };
}
