/**
 * delivery types / DTOs.
 */
import type { DeliveryStatus, ProofType } from '@bazar/constants';
import type { Id, LatLngDto, MoneyDto, TenantEntity } from './common.js';
import type { CourierPublicDto } from './courier.js';

/**
 * The courier-side view of an order: one Delivery per Order, holding everything
 * about the trip itself so the orders module stays about goods and money.
 */
export interface DeliveryDto extends TenantEntity {
  orderId: Id;
  courierId: Id | null;
  courier: CourierPublicDto | null;
  status: DeliveryStatus;
  pickupPoint: LatLngDto | null;
  pickupAddress: string;
  dropoffPoint: LatLngDto | null;
  dropoffAddress: string;
  distanceMeters: number;
  /** What the courier earns for this trip. */
  payout: MoneyDto;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  etaAt: string | null;
  proofType: ProofType;
  proofUrl: string | null;
  /** Code the customer reads out on handover, when proofType is CODE. */
  handoverCode: string | null;
  failureReason: string | null;
  /** Couriers who declined or timed out: never offered this order again. */
  attemptCount: number;
}

/** A time-limited offer pushed to one courier. */
export interface DeliveryOfferDto {
  deliveryId: Id;
  orderId: Id;
  orderNumber: string;
  storeName: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceMeters: number;
  payout: MoneyDto;
  itemCount: number;
  weightGrams: number;
  /** Absolute deadline; the client shows a countdown to it. */
  expiresAt: string;
}

export interface AcceptDeliveryDto {
  lat?: number;
  lng?: number;
}

export interface CompleteDeliveryDto {
  /** Photo/signature upload id, or the code the customer gave. */
  proofUrl?: string;
  handoverCode?: string;
  /** Weighed goods: actual quantities bought, which reprices the order. */
  actualItems?: { orderItemId: Id; actualQuantity: number }[];
  lat?: number;
  lng?: number;
}

export interface FailDeliveryDto {
  reason: string;
  photoUrl?: string;
}

export interface DeliveryListQuery {
  courierId?: Id;
  status?: DeliveryStatus;
  cityId?: Id;
  from?: string;
  to?: string;
}
