/**
 * Order/Delivery events → websocket rooms.
 */
import { PAYMENT_STATUS, type PaymentStatus } from '@bazar/constants';
import { WS_EVENT } from '@bazar/types';
import { money } from '../../common/dto/index.js';
import type { RealtimePublisher } from '../../infrastructure/redis/realtime-events.js';
import { room } from '../../websocket/rooms.js';
import { DELIVERY_EVENT } from '../../modules/delivery/domain/delivery.events.js';
import { ORDER_EVENT } from '../../modules/orders/domain/order.events.js';
import { PAYMENT_EVENT } from '../../modules/payments/domain/payment.events.js';
import type { EventBus } from '../event-bus.js';

/**
 * Turns domain events into socket traffic. The customer app, the courier app
 * and the operator dashboard all watch the same order from different rooms,
 * so one status change fans out to three.
 */
export function registerOrderRealtimeHandlers(events: EventBus, realtime: RealtimePublisher): void {
  events.on(ORDER_EVENT.STATUS_CHANGED, async (event) => {
    const { orderId, number, from, to, customerId, cityId } = event.payload;
    const payload = {
      orderId,
      number,
      status: to,
      previousStatus: from,
      at: event.at.toISOString(),
    };

    await realtime.emitToRooms(
      [room.order(orderId), room.customer(customerId)],
      WS_EVENT.ORDER_STATUS_CHANGED,
      payload,
    );

    // Operators watch a city feed rather than individual orders.
    await realtime.emit(room.operator(cityId), WS_EVENT.OPERATOR_ORDER_UPSERT, {
      ...payload,
      cityId,
    });
  });

  events.on(ORDER_EVENT.REPRICED, async (event) => {
    const { orderId, customerId, previousTotal, total } = event.payload;
    await realtime.emitToRooms(
      [room.order(orderId), room.customer(customerId)],
      WS_EVENT.ORDER_REPRICED,
      { orderId, previousTotal, total },
    );
  });

  // Chat: both ends of the thread, plus the courier's own room in case the
  // courier app never joined the order room.
  events.on(ORDER_EVENT.MESSAGE, async (event) => {
    const { orderId, customerId, courierId, message } = event.payload;
    await realtime.emitToRooms(
      [
        room.order(orderId),
        room.customer(customerId),
        ...(courierId !== null ? [room.courier(courierId)] : []),
      ],
      WS_EVENT.ORDER_MESSAGE,
      message,
    );
  });

  events.on(ORDER_EVENT.CREATED, async (event) => {
    const { orderId, number, storeId, itemCount } = event.payload;
    // The stall needs to start gathering goods before a courier shows up.
    await realtime.emit(room.store(storeId), WS_EVENT.STORE_NEW_ORDER, {
      orderId,
      number,
      itemCount,
    });
  });

  events.on(DELIVERY_EVENT.COURIER_ASSIGNED, async (event) => {
    const { orderId, etaSeconds } = event.payload;
    await realtime.emit(room.order(orderId), WS_EVENT.ORDER_ETA_UPDATED, {
      orderId,
      etaSeconds,
      etaAt: etaSeconds === null ? null : new Date(Date.now() + etaSeconds * 1000).toISOString(),
    });
  });

  // Payment outcomes: the waiting screen flips "Не оплачен" → "Оплачено" without a reload.
  const paid =
    (paymentStatus: PaymentStatus) =>
    async (event: { payload: { orderId: string | null; customerId: string } }) => {
      // Plus months and tips have no order screen to flip; the customer room still hears it.
      const { orderId, customerId } = event.payload;
      await realtime.emitToRooms(
        orderId === null
          ? [room.customer(customerId)]
          : [room.order(orderId), room.customer(customerId)],
        WS_EVENT.ORDER_PAYMENT_UPDATED,
        { orderId, paymentStatus },
      );
    };
  events.on(PAYMENT_EVENT.CAPTURED, paid(PAYMENT_STATUS.CAPTURED));
  events.on(PAYMENT_EVENT.FAILED, paid(PAYMENT_STATUS.FAILED));
  events.on(PAYMENT_EVENT.CANCELLED, paid(PAYMENT_STATUS.CANCELLED));
  events.on(PAYMENT_EVENT.REFUNDED, paid(PAYMENT_STATUS.REFUNDED));

  // The offer card in the courier app. Whoever accepts first wins; the others
  // get the expiry so the card disappears instead of failing on tap.
  events.on(DELIVERY_EVENT.OFFER_SENT, async (event) => {
    const { courierId, customerId: _customer, payout, currency, ...offer } = event.payload;
    await realtime.emit(room.courier(courierId), WS_EVENT.DELIVERY_OFFER, {
      ...offer,
      payout: money(payout, currency),
    });
  });

  events.on(DELIVERY_EVENT.COURIER_ASSIGNED, async (event) => {
    const { deliveryId, orderId, courierId, offeredCourierIds } = event.payload;
    await Promise.all([
      // The winner may not have tapped anything (dispatcher assignment).
      realtime.emit(room.courier(courierId), WS_EVENT.DELIVERY_ASSIGNED, { deliveryId, orderId }),
      ...offeredCourierIds
        .filter((id) => id !== courierId)
        .map((id) =>
          realtime.emit(room.courier(id), WS_EVENT.DELIVERY_OFFER_EXPIRED, { deliveryId }),
        ),
    ]);
  });
}
