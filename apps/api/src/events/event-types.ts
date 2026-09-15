/**
 * Union of all domain event names and payloads, imported from each module's
 * own `domain/<module>.events.ts`.
 */
import { DELIVERY_EVENT } from '../modules/delivery/domain/delivery.events.js';
import { ORDER_EVENT } from '../modules/orders/domain/order.events.js';
import { PAYMENT_EVENT } from '../modules/payments/domain/payment.events.js';
import type { DeliveryEventPayloads } from '../modules/delivery/domain/delivery.events.js';
import type { OrderEventPayloads } from '../modules/orders/domain/order.events.js';
import type { PaymentEventPayloads } from '../modules/payments/domain/payment.events.js';

/**
 * The full catalogue of things that happen in this system. One place, so a
 * handler cannot subscribe to an event no module emits, and adding an event
 * without registering it here is a type error at the publish site.
 */
export const EVENT = {
  ...ORDER_EVENT,
  ...DELIVERY_EVENT,
  ...PAYMENT_EVENT,
} as const;

export type EventPayloads = OrderEventPayloads & DeliveryEventPayloads & PaymentEventPayloads;

export type EventName = keyof EventPayloads;

export type { OrderEventPayloads, DeliveryEventPayloads, PaymentEventPayloads };
