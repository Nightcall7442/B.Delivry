/**
 * Delivery events: CourierAssigned, PickedUp, Delivered, DeliveryFailed.
 */

export const DELIVERY_EVENT = {
  SEARCH_STARTED: 'delivery.search_started',
  OFFER_SENT: 'delivery.offer_sent',
  COURIER_ASSIGNED: 'delivery.courier_assigned',
  COURIER_RELEASED: 'delivery.courier_released',
  ARRIVED_PICKUP: 'delivery.arrived_pickup',
  PICKED_UP: 'delivery.picked_up',
  ARRIVED_DROPOFF: 'delivery.arrived_dropoff',
  DELIVERED: 'delivery.delivered',
  FAILED: 'delivery.failed',
  SEARCH_EXHAUSTED: 'delivery.search_exhausted',
} as const;

export type DeliveryEventName = (typeof DELIVERY_EVENT)[keyof typeof DELIVERY_EVENT];

interface DeliveryRef {
  deliveryId: string;
  orderId: string;
  customerId: string;
}

export interface DeliveryEventPayloads {
  'delivery.search_started': DeliveryRef & { radiusMeters: number; attempt: number };
  /** Carries what the courier app shows on the offer card, so the socket
   *  handler needs no second lookup. */
  'delivery.offer_sent': DeliveryRef & {
    courierId: string;
    expiresAt: string;
    orderNumber: string;
    storeName: string;
    pickupAddress: string;
    dropoffAddress: string;
    distanceMeters: number;
    payout: number;
    currency: string;
    itemCount: number;
    weightGrams: number;
  };
  'delivery.courier_assigned': DeliveryRef & {
    courierId: string;
    etaSeconds: number | null;
    payout: number;
    /** Everyone the offer went to, so the losers' cards can be withdrawn. */
    offeredCourierIds: string[];
  };
  /** Courier dropped the job; the order goes back to the search. */
  'delivery.courier_released': DeliveryRef & { courierId: string; reason: string };
  'delivery.arrived_pickup': DeliveryRef & { courierId: string };
  'delivery.picked_up': DeliveryRef & { courierId: string };
  'delivery.arrived_dropoff': DeliveryRef & { courierId: string };
  'delivery.delivered': DeliveryRef & {
    courierId: string;
    payout: number;
    /** Cash the courier collected and now owes the platform. */
    cashCollected: number;
    orderTotal: number;
    /** The courier's user id: the wallet the cash debt is booked against. */
    courierUserId: string;
  };
  'delivery.failed': DeliveryRef & { courierId: string | null; reason: string };
  /** Nobody accepted before the timeout: an operator has to step in. */
  'delivery.search_exhausted': DeliveryRef & { attempts: number; lastRadiusMeters: number };
}
