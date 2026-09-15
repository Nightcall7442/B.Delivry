/**
 * /webhooks/* — payment provider callbacks, telegram, sms delivery reports (signature-verified).
 */
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import type { TelegramUpdate } from '../modules/notifications/index.js';
import { webhookParamsSchema } from '../modules/payments/schemas/index.js';
import { validate } from '../middleware/validation.middleware.js';

/**
 * Mounted outside the API prefix and outside authentication: providers call in
 * from their own servers with no token. Every handler verifies a signature
 * before believing a single field of the payload.
 */
export function webhooksRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    // Signatures are computed over the exact bytes, so the raw body is kept
    // rather than only the parsed object.
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
      try {
        done(null, body);
      } catch (error) {
        done(error as Error, undefined);
      }
    });

    // Click posts a form, not JSON.
    app.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(String(body))));
      },
    );

    // The two providers with their own protocols answer in their own shapes;
    // everyone else goes through the generic signed-webhook path.
    app.post('/payments/payme', container.controllers.payments.paymeRpc);
    app.post('/payments/click', container.controllers.payments.clickShop);
    app.post(
      '/payments/:provider',
      { preHandler: validate({ params: webhookParamsSchema }) },
      container.controllers.payments.webhook,
    );

    // Telegram sends a secret token header it was configured with; anything
    // else is somebody else knocking.
    app.post('/telegram', async (request, reply) => {
      const secret = container.config.notifications.telegram.webhookSecret;
      const provided = request.headers['x-telegram-bot-api-secret-token'];

      if (secret === undefined || provided !== secret) {
        return reply.code(401).send({ ok: false });
      }

      // JSON is kept raw in this scope (see above); Telegram's is plain JSON.
      const update = JSON.parse(String(request.body)) as TelegramUpdate;
      // Handled in order, one update at a time: /start must land before /orders.
      // A failure is logged and still answered 200, or Telegram retries forever.
      await container.services.telegramBot
        .handleUpdate(update)
        .catch((error: unknown) => container.logger.warn({ err: error }, 'telegram update failed'));
      return reply.send({ ok: true });
    });

    // Delivery receipts from the SMS gateway: logged, never trusted for state.
    app.post('/sms/:provider', async (request, reply) => {
      container.logger.info({ report: request.body }, 'sms delivery report');
      return reply.send({ ok: true });
    });
  };
}
