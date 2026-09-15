/**
 * Capture / verify / refund payment asynchronously.
 */
import { money } from '@bazar/payments';
import type { Container } from '../../app/container.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { ProcessPaymentJob } from '../queues.js';

/**
 * Provider calls are slow and fail in ways that need patience, so they run
 * here rather than in a request. The transaction table's unique idempotency
 * key is what makes a retry safe: the second attempt records nothing and
 * charges nothing.
 */
export function processPaymentJob(container: Container) {
  return async (payload: ProcessPaymentJob): Promise<void> => {
    const context = systemContext(payload.tenantId, `job:payment:${payload.paymentId}`, 'uz');

    await runWithContext(context, async () => {
      const payments = container.services.payments;

      switch (payload.action) {
        case 'capture':
          await payments.capture(payload.paymentId);
          return;

        case 'refund':
          await payments.refund(payload.paymentId, {
            reason: payload.reason ?? 'Automatic refund',
            ...(payload.amount !== undefined ? { amount: money(payload.amount, 'UZS') } : {}),
          });
          return;

        case 'verify': {
          // Reconciliation for a payment whose webhook never arrived: ask the
          // provider what it thinks the state is.
          const payment = await payments.get(payload.paymentId);
          container.logger.info(
            { paymentId: payment.id, status: payment.status },
            'payment verification requested',
          );
          return;
        }

        default:
          container.logger.warn({ payload }, 'unknown payment job action');
      }
    });
  };
}
