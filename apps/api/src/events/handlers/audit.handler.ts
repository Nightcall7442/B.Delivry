/**
 * Mutating events → audit module.
 */
import type { AuditWriter } from '../../modules/audit/types/index.js';
import { DELIVERY_EVENT } from '../../modules/delivery/domain/delivery.events.js';
import { ORDER_EVENT } from '../../modules/orders/domain/order.events.js';
import { PAYMENT_EVENT } from '../../modules/payments/domain/payment.events.js';
import type { EventBus } from '../event-bus.js';

/**
 * Everything that moves an order or money leaves a row. Written from events
 * rather than from services so a new caller cannot forget to audit: if it
 * happened, it published, and if it published, it is recorded.
 */
export function registerAuditHandlers(events: EventBus, audit: AuditWriter): void {
  const record = (
    action: string,
    entity: string,
    entityId: string,
    after: Record<string, unknown>,
    event: { tenantId: string; actorId?: string | null; requestId?: string },
  ): Promise<void> =>
    audit.record({
      tenantId: event.tenantId,
      actorId: event.actorId ?? null,
      action,
      entity,
      entityId,
      before: null,
      after,
      requestId: event.requestId ?? null,
    });

  events.on(ORDER_EVENT.STATUS_CHANGED, (event) =>
    record(
      'order.status_changed',
      'Order',
      event.payload.orderId,
      { from: event.payload.from, to: event.payload.to, comment: event.payload.comment },
      event,
    ),
  );

  events.on(ORDER_EVENT.CANCELLED, (event) =>
    record(
      'order.cancelled',
      'Order',
      event.payload.orderId,
      { reason: event.payload.reason, cancelledBy: event.payload.cancelledBy },
      event,
    ),
  );

  events.on(ORDER_EVENT.REPRICED, (event) =>
    record(
      'order.repriced',
      'Order',
      event.payload.orderId,
      { previousTotal: event.payload.previousTotal, total: event.payload.total },
      event,
    ),
  );

  events.on(DELIVERY_EVENT.COURIER_ASSIGNED, (event) =>
    record(
      'delivery.courier_assigned',
      'Delivery',
      event.payload.deliveryId,
      { courierId: event.payload.courierId, payout: event.payload.payout },
      event,
    ),
  );

  events.on(DELIVERY_EVENT.COURIER_RELEASED, (event) =>
    record(
      'delivery.courier_released',
      'Delivery',
      event.payload.deliveryId,
      { courierId: event.payload.courierId, reason: event.payload.reason },
      event,
    ),
  );

  events.on(PAYMENT_EVENT.CAPTURED, (event) =>
    record(
      'payment.captured',
      'Payment',
      event.payload.paymentId,
      { amount: event.payload.amount, provider: event.payload.provider },
      event,
    ),
  );

  events.on(PAYMENT_EVENT.REFUNDED, (event) =>
    record(
      'payment.refunded',
      'Payment',
      event.payload.paymentId,
      { refundedAmount: event.payload.refundedAmount, reason: event.payload.reason },
      event,
    ),
  );
}
