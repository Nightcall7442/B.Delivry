/**
 * Order domain events: OrderCreated, OrderConfirmed, OrderStatusChanged, OrderCancelled.
 */
import type { OrderStatus, PaymentMethod } from '@bazar/constants';

export const ORDER_EVENT = {
  CREATED: 'order.created',
  CONFIRMED: 'order.confirmed',
  STATUS_CHANGED: 'order.status_changed',
  CANCELLED: 'order.cancelled',
  DELIVERED: 'order.delivered',
  FAILED: 'order.failed',
  REPRICED: 'order.repriced',
  MESSAGE: 'order.message',
} as const;

export type OrderEventName = (typeof ORDER_EVENT)[keyof typeof ORDER_EVENT];

/** Common shape: every consumer needs the id, the number and who it belongs to. */
interface OrderRef {
  orderId: string;
  number: string;
  customerId: string;
  storeId: string;
  cityId: string;
}

export interface OrderEventPayloads {
  'order.created': OrderRef & {
    total: number;
    currency: string;
    paymentMethod: PaymentMethod;
    itemCount: number;
  };
  'order.confirmed': OrderRef & {
    autoConfirmed: boolean;
    /** Delivery window start, when the customer chose one: the search waits for it. */
    scheduledFor: string | null;
    /** Bazar Plus: the courier search starts wider, so the offer goes out sooner. */
    priority: boolean;
  };
  /**
   * The workhorse event. Notifications, the live map, the operator dashboard
   * and the audit log all hang off this one.
   */
  'order.status_changed': OrderRef & {
    from: OrderStatus;
    to: OrderStatus;
    actorId: string | null;
    comment: string | null;
  };
  'order.cancelled': OrderRef & {
    reason: string;
    /** Who pulled the plug: the customer, an operator, or a timeout. */
    cancelledBy: 'customer' | 'staff' | 'system';
    refundable: boolean;
  };
  'order.delivered': OrderRef & { courierId: string | null; deliverySeconds: number };
  'order.failed': OrderRef & { reason: string; atStatus: OrderStatus };
  /** Weighed goods came in heavier or lighter than ordered. */
  'order.repriced': OrderRef & { previousTotal: number; total: number; currency: string };
  'order.message': OrderRef & {
    courierId: string | null;
    message: {
      id: string;
      orderId: string;
      senderUserId: string;
      senderRole: 'CUSTOMER' | 'COURIER' | 'STAFF';
      text: string;
      createdAt: string;
    };
  };
}
