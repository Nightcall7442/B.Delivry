/**
 * websocket-events types / DTOs.
 */
import type { HaggleDto } from './haggle.js';
import type { ChatMessageDto } from './order.js';
import type { OrderStatus, PaymentStatus } from '@bazar/constants';
import type { Id, LatLngDto } from './common.js';
import type { DeliveryOfferDto } from './delivery.js';
import type { NotificationDto } from './notification.js';

/** Names are shared verbatim between server and every client. */
export const WS_EVENT = {
  ORDER_STATUS_CHANGED: 'order.status_changed',
  ORDER_ETA_UPDATED: 'order.eta_updated',
  /** The money moved (or failed to): paymentStatus on the order changed. */
  ORDER_PAYMENT_UPDATED: 'order.payment_updated',
  /** The courier weighed the goods: items and totals changed. */
  ORDER_REPRICED: 'order.repriced',
  /** A chat line for the order's thread. */
  ORDER_MESSAGE: 'order.message',
  /** The vendor answered a discount request. */
  HAGGLE_ANSWERED: 'haggle.answered',
  COURIER_LOCATION: 'courier.location',
  DELIVERY_OFFER: 'delivery.offer',
  DELIVERY_OFFER_EXPIRED: 'delivery.offer_expired',
  /** The desk handed this courier a delivery without an offer. */
  DELIVERY_ASSIGNED: 'delivery.assigned',
  NOTIFICATION: 'notification',
  STORE_NEW_ORDER: 'store.new_order',
  OPERATOR_ORDER_UPSERT: 'operator.order_upsert',
} as const;

export type WsEventName = (typeof WS_EVENT)[keyof typeof WS_EVENT];

export interface OrderStatusChangedEvent {
  orderId: Id;
  number: string;
  status: OrderStatus;
  previousStatus: OrderStatus;
  at: string;
}

export interface OrderEtaUpdatedEvent {
  orderId: Id;
  etaAt: string | null;
  etaSeconds: number | null;
}

export interface CourierLocationEvent {
  orderId: Id | null;
  courierId: Id;
  point: LatLngDto;
  heading: number | null;
  at: string;
}

/** Server to client. Client to server messages are just `join`/`leave`. */
export interface ServerEvents {
  [WS_EVENT.ORDER_STATUS_CHANGED]: OrderStatusChangedEvent;
  [WS_EVENT.ORDER_ETA_UPDATED]: OrderEtaUpdatedEvent;
  /** orderId is null for a Plus month or a tip. */
  [WS_EVENT.ORDER_PAYMENT_UPDATED]: { orderId: Id | null; paymentStatus: PaymentStatus };
  [WS_EVENT.ORDER_REPRICED]: { orderId: Id; previousTotal: number; total: number };
  [WS_EVENT.ORDER_MESSAGE]: ChatMessageDto;
  [WS_EVENT.HAGGLE_ANSWERED]: HaggleDto;
  [WS_EVENT.COURIER_LOCATION]: CourierLocationEvent;
  [WS_EVENT.DELIVERY_OFFER]: DeliveryOfferDto;
  [WS_EVENT.DELIVERY_OFFER_EXPIRED]: { deliveryId: Id };
  [WS_EVENT.DELIVERY_ASSIGNED]: { deliveryId: Id; orderId: Id };
  [WS_EVENT.NOTIFICATION]: NotificationDto;
  [WS_EVENT.STORE_NEW_ORDER]: { orderId: Id; number: string; itemCount: number };
  [WS_EVENT.OPERATOR_ORDER_UPSERT]: OrderStatusChangedEvent & { cityId: Id };
}

export interface WsMessage<K extends WsEventName = WsEventName> {
  event: K;
  data: ServerEvents[K];
  /** Server send time, so clients can drop stale location pings. */
  at: string;
}

export type WsClientCommand =
  { action: 'join'; room: string } | { action: 'leave'; room: string } | { action: 'ping' };
