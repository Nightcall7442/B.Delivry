/**
 * OrderStatusChanged → notifications module.
 */
import { ORDER_STATUS, type OrderStatus } from '@bazar/constants';
import { TEMPLATE, type TemplateKey } from '@bazar/notifications';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { JobQueue } from '../../infrastructure/redis/queue.js';
import { JOB, QUEUE, type SendNotificationJob } from '../../jobs/queues.js';
import type { NotificationsService } from '../../modules/notifications/service/notifications.service.js';
import { ORDER_EVENT } from '../../modules/orders/domain/order.events.js';
import type { OrdersService } from '../../modules/orders/service/orders.service.js';
import { PAYMENT_EVENT } from '../../modules/payments/domain/payment.events.js';
import type { EventBus } from '../event-bus.js';

/** For the one message that goes to a phone without an account: the order's recipient. */
export interface RecipientDeps {
  orders: OrdersService;
  notifications: NotificationsService;
}

/**
 * Not every transition is worth a push. SEARCHING_COURIER and PICKING_UP are
 * internal churn the customer does not need to be told about; the rest are
 * moments where a person is waiting for news.
 */
const STATUS_TEMPLATES: Partial<Record<OrderStatus, TemplateKey>> = {
  [ORDER_STATUS.CONFIRMED]: TEMPLATE.ORDER_CONFIRMED,
  [ORDER_STATUS.COURIER_ASSIGNED]: TEMPLATE.ORDER_COURIER_ASSIGNED,
  [ORDER_STATUS.PICKED_UP]: TEMPLATE.ORDER_PICKED_UP,
  [ORDER_STATUS.IN_DELIVERY]: TEMPLATE.ORDER_IN_DELIVERY,
  [ORDER_STATUS.COURIER_ARRIVED]: TEMPLATE.ORDER_COURIER_ARRIVED,
  [ORDER_STATUS.DELIVERED]: TEMPLATE.ORDER_DELIVERED,
  [ORDER_STATUS.CANCELLED]: TEMPLATE.ORDER_CANCELLED,
  [ORDER_STATUS.FAILED]: TEMPLATE.ORDER_FAILED,
};

export function registerOrderNotificationHandlers(
  events: EventBus,
  queue: JobQueue,
  recipient: RecipientDeps,
): void {
  const send = async (job: SendNotificationJob): Promise<void> => {
    await queue.enqueue(QUEUE.NOTIFICATIONS, JOB.SEND_NOTIFICATION, job, {
      ...(job.idempotencyKey !== undefined ? { jobId: job.idempotencyKey } : {}),
    });
  };

  events.on(ORDER_EVENT.STATUS_CHANGED, async (event) => {
    const template = STATUS_TEMPLATES[event.payload.to];
    if (template === undefined) return;

    const { orderId, number, customerId } = event.payload;
    await send({
      tenantId: event.tenantId,
      userId: customerId,
      template,
      params: { orderNumber: number },
      orderId,
      deepLink: `/orders/${orderId}`,
      // One notification per order per status, even if the event is replayed.
      idempotencyKey: `notify:${orderId}:${event.payload.to}`,
    });
  });

  // "Заказ родителям": when the courier sets off, the person at the door hears
  // about it once, by SMS, with the sender's name.
  events.on(ORDER_EVENT.STATUS_CHANGED, async (event) => {
    if (event.payload.to !== ORDER_STATUS.IN_DELIVERY) return;
    await runWithContext(systemContext(event.tenantId, `recipient:${event.id}`, 'uz'), async () => {
      const order = await recipient.orders.get(event.payload.orderId);
      if (!order.recipientPhone) return;
      await recipient.notifications.sendDirect({
        tenantId: event.tenantId,
        phone: order.recipientPhone,
        locale: 'uz',
        template: TEMPLATE.ORDER_FOR_RECIPIENT,
        params: {
          from: order.customer?.user.firstName ?? order.customer?.user.phone ?? 'Bazar Delivery',
          orderNumber: order.number,
        },
      });
    });
  });

  events.on(PAYMENT_EVENT.CAPTURED, async (event) => {
    await send({
      tenantId: event.tenantId,
      userId: event.payload.customerId,
      template: TEMPLATE.PAYMENT_CAPTURED,
      params: { amount: event.payload.amount / 100, currency: event.payload.currency },
      ...(event.payload.orderId !== null ? { orderId: event.payload.orderId } : {}),
      idempotencyKey: `notify:payment-captured:${event.payload.paymentId}`,
    });
  });

  events.on(PAYMENT_EVENT.REFUNDED, async (event) => {
    await send({
      tenantId: event.tenantId,
      userId: event.payload.customerId,
      template: TEMPLATE.PAYMENT_REFUNDED,
      params: { amount: event.payload.refundedAmount / 100, currency: event.payload.currency },
      ...(event.payload.orderId !== null ? { orderId: event.payload.orderId } : {}),
      idempotencyKey: `notify:payment-refunded:${event.payload.paymentId}`,
    });
  });
}
