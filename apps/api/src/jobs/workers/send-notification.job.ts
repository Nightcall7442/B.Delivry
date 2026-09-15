/**
 * Deliver notification through provider with retry/backoff.
 */
import type { Container } from '../../app/container.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { SendNotificationJob } from '../queues.js';

/**
 * Notifications are queued rather than sent inline because providers are slow
 * and sometimes down, and no customer should wait on an SMS gateway to see
 * their order confirmed.
 *
 * Retries come from the queue (exponential backoff, five attempts); the
 * idempotency key on the notification row is what keeps a retry from sending
 * the same message twice.
 */
export function sendNotificationJob(container: Container) {
  return async (payload: SendNotificationJob): Promise<void> => {
    const context = systemContext(payload.tenantId, `job:notify:${payload.userId}`, 'uz');

    await runWithContext(context, () =>
      container.services.notifications.send({
        tenantId: payload.tenantId,
        userId: payload.userId,
        template: payload.template,
        params: payload.params,
        channel: payload.channel,
        orderId: payload.orderId,
        deepLink: payload.deepLink,
        imageUrl: payload.imageUrl,
        idempotencyKey: payload.idempotencyKey,
      }),
    );
  };
}
