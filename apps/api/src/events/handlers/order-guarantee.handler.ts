/**
 * The late-delivery promise, kept by a machine rather than a support desk:
 * delivered later than promised + tolerance → the delivery fee goes back to
 * the customer's balance, and they are told. The freshness promise is a
 * human call and stays a support ticket.
 */
import {
  GUARANTEE,
  type Currency,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
} from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { money } from '@bazar/payments';
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import type { JobQueue } from '../../infrastructure/redis/queue.js';
import { JOB, QUEUE } from '../../jobs/queues.js';
import { ORDER_EVENT } from '../../modules/orders/domain/order.events.js';
import { DELIVERY_EVENT } from '../../modules/delivery/domain/delivery.events.js';
import type { OrdersService } from '../../modules/orders/service/orders.service.js';
import type { PaymentsService } from '../../modules/payments/service/payments.service.js';
import type { EventBus } from '../event-bus.js';

export interface GuaranteeDeps {
  orders: OrdersService;
  payments: PaymentsService;
  queue: JobQueue;
}

/** Minutes past the promise, or 0. Shared shape with the storefront's `lateMinutes`. */
export const lateMinutes = (promisedAt: Date | null, deliveredAt: Date | null): number =>
  promisedAt === null || deliveredAt === null
    ? 0
    : Math.max(0, Math.floor((deliveredAt.getTime() - promisedAt.getTime()) / 60_000));

export function registerOrderGuaranteeHandlers(events: EventBus, deps: GuaranteeDeps): void {
  // A paid order that never reaches the door — cancelled, or the goods were not there — comes
  // back to the balance at once; nobody has to write to support for their own money.
  events.on(ORDER_EVENT.STATUS_CHANGED, async (event) => {
    const { to, orderId } = event.payload;
    if (to !== ORDER_STATUS.CANCELLED && to !== ORDER_STATUS.FAILED) return;
    await runWithContext(systemContext(event.tenantId, `refund:${event.id}`, 'uz'), async () => {
      const order = await deps.orders.get(orderId);
      if (order.paymentStatus !== PAYMENT_STATUS.CAPTURED) return;
      if (order.paymentMethod === PAYMENT_METHOD.CASH) return;
      if (order.customer === null || order.customer === undefined) return;

      await deps.payments.creditWallet({
        userId: order.customer.userId,
        type: 'REFUND',
        amount: money(order.total, order.currency as Currency),
        orderId: order.id,
        comment: `order ${to.toLowerCase()}`,
      });
      await deps.orders.setPaymentStatus(order.id, PAYMENT_STATUS.REFUNDED);
      await deps.queue.enqueue(
        QUEUE.NOTIFICATIONS,
        JOB.SEND_NOTIFICATION,
        {
          tenantId: event.tenantId,
          userId: order.customerId,
          template: TEMPLATE.PAYMENT_REFUNDED,
          params: { amount: order.total / 100, currency: order.currency },
          orderId: order.id,
          deepLink: `/orders/${order.id}`,
          idempotencyKey: `notify:refund:${order.id}`,
        },
        { jobId: `notify:refund:${order.id}` },
      );
    });
  });

  events.on(DELIVERY_EVENT.DELIVERED, async (event) => {
    await runWithContext(systemContext(event.tenantId, `guarantee:${event.id}`, 'uz'), async () => {
      const order = await deps.orders.get(event.payload.orderId);
      const late = lateMinutes(order.promisedAt, order.deliveredAt);
      if (late <= GUARANTEE.LATE_TOLERANCE_MINUTES || order.deliveryFee <= 0) return;
      if (order.customer === null || order.customer === undefined) return;

      await deps.payments.creditWallet({
        userId: order.customer.userId,
        type: 'REFUND',
        amount: money(order.deliveryFee, order.currency as Currency),
        orderId: order.id,
        comment: `late by ${late} min`,
      });
      await deps.queue.enqueue(
        QUEUE.NOTIFICATIONS,
        JOB.SEND_NOTIFICATION,
        {
          tenantId: event.tenantId,
          userId: order.customerId,
          template: TEMPLATE.PAYMENT_REFUNDED,
          params: { amount: order.deliveryFee / 100, currency: order.currency },
          orderId: order.id,
          deepLink: `/orders/${order.id}`,
          idempotencyKey: `notify:late-refund:${order.id}`,
        },
        { jobId: `notify:late-refund:${order.id}` },
      );
    });
  });
}
