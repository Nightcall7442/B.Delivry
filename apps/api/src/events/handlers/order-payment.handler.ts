/**
 * Payment events → the order's paymentStatus; delivered cash orders → a
 * captured cash payment. The order row is what every screen reads, so it has
 * to follow the money without anyone polling the payments table.
 */
import { PAYMENT_METHOD, PAYMENT_STATUS, type PaymentStatus } from '@bazar/constants';
import { systemContext } from '../../common/types/request-context.js';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { DELIVERY_EVENT } from '../../modules/delivery/domain/delivery.events.js';
import type { OrdersService } from '../../modules/orders/service/orders.service.js';
import { PAYMENT_EVENT } from '../../modules/payments/domain/payment.events.js';
import type { PaymentsService } from '../../modules/payments/service/payments.service.js';
import type { EventBus } from '../event-bus.js';

export interface PaymentSyncDeps {
  orders: OrdersService;
  payments: PaymentsService;
}

export function registerOrderPaymentHandlers(events: EventBus, deps: PaymentSyncDeps): void {
  const sync =
    (status: PaymentStatus) =>
    async (event: { tenantId: string; id: string; payload: { orderId: string | null } }) => {
      // A Plus month or a tip has no order to mark.
      const { orderId } = event.payload;
      if (orderId === null) return;
      await runWithContext(systemContext(event.tenantId, `payment-sync:${event.id}`, 'uz'), () =>
        deps.orders.setPaymentStatus(orderId, status),
      );
    };

  events.on(PAYMENT_EVENT.AUTHORIZED, sync(PAYMENT_STATUS.AUTHORIZED));
  events.on(PAYMENT_EVENT.CAPTURED, sync(PAYMENT_STATUS.CAPTURED));
  events.on(PAYMENT_EVENT.FAILED, sync(PAYMENT_STATUS.FAILED));
  events.on(PAYMENT_EVENT.CANCELLED, sync(PAYMENT_STATUS.CANCELLED));
  events.on(PAYMENT_EVENT.REFUNDED, async (event) => {
    const { orderId } = event.payload;
    if (orderId === null) return;
    await runWithContext(systemContext(event.tenantId, `payment-sync:${event.id}`, 'uz'), () =>
      deps.orders.setPaymentStatus(
        orderId,
        event.payload.full ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PARTIALLY_REFUNDED,
      ),
    );
  });

  // Cash changes hands at the door: that is the moment the payment exists.
  events.on(DELIVERY_EVENT.DELIVERED, async (event) => {
    if (event.payload.cashCollected <= 0) return;
    await runWithContext(systemContext(event.tenantId, `cash:${event.id}`, 'uz'), async () => {
      const payment = await deps.payments.create({
        orderId: event.payload.orderId,
        method: PAYMENT_METHOD.CASH,
      });
      await deps.payments.capture(payment.id, event.payload.courierUserId);
    });
  });
}
