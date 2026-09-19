/**
 * order types / DTOs.
 */
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductUnit,
  DeliveryStatus,
  SubstitutionPolicy,
} from '@bazar/constants';
import type { OrderAddressDto } from './address.js';
import type { Entity, Id, LatLngDto, MoneyDto, TenantEntity, Translated } from './common.js';
import type { StoreSummaryDto } from './store.js';

/**
 * Order items are a snapshot, not a join: name, unit and price are copied at
 * creation so a later catalog edit cannot rewrite what the customer agreed to.
 */
export interface OrderItemDto extends Entity {
  productId: Id | null;
  name: Translated;
  unit: ProductUnit;
  quantity: number;
  unitPrice: MoneyDto;
  total: MoneyDto;
  comment: string | null;
  /** Weighed goods: what the courier actually bought at the stall. */
  actualQuantity: number | null;
  actualTotal: MoneyDto | null;
  /** The scale at the stall, photographed by the courier. */
  weighingPhotoUrl: string | null;
}

export interface OrderTotalsDto {
  subtotal: MoneyDto;
  deliveryFee: MoneyDto;
  serviceFee: MoneyDto;
  discount: MoneyDto;
  total: MoneyDto;
}

export interface OrderStatusHistoryDto {
  status: OrderStatus;
  at: string;
  /** User id of whoever caused the change; null for system transitions. */
  actorId: Id | null;
  comment: string | null;
}

export interface OrderDto extends TenantEntity {
  /** Human-facing, e.g. BZ-240907-4KDQ8P. Read out over the phone. */
  number: string;
  status: OrderStatus;
  customerId: Id;
  storeId: Id;
  store: StoreSummaryDto;
  courierId: Id | null;
  /** Who ordered — the dispatcher calls this number when something goes wrong. */
  customer: { id: Id; firstName: string | null; phone: string } | null;
  /** The trip, once one exists (from CONFIRMED on). */
  delivery: { id: Id; status: DeliveryStatus; courierId: Id | null; etaAt: string | null } | null;
  items: OrderItemDto[];
  totals: OrderTotalsDto;
  address: OrderAddressDto;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  comment: string | null;
  vendorComment: string | null;
  substitutionPolicy: SubstitutionPolicy;
  /** Who takes the order when it is not the customer (parents, a neighbour). */
  recipientName: string | null;
  recipientPhone: string | null;
  /** Cross-bazaar: the leading order's id shared by sibling orders on one courier trip. */
  groupId: string | null;
  /** INVOICE orders: pay by this date. */
  dueAt: string | null;
  /** Null for "as soon as possible"; set for a scheduled slot. */
  scheduledFor: string | null;
  /** When the customer was told to expect the order; the late promise is measured against it. */
  promisedAt: string | null;
  etaAt: string | null;
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  statusHistory: OrderStatusHistoryDto[];
}

export interface OrderSummaryDto {
  id: Id;
  number: string;
  status: OrderStatus;
  storeName: Translated;
  total: MoneyDto;
  itemCount: number;
  placedAt: string;
  etaAt: string | null;
}

/** Cross-bazaar: one trip from several stalls of one bazaar; one order per stall. */
export interface CreateGroupOrderDto extends Omit<CreateOrderDto, 'storeId' | 'items'> {
  stores: { storeId: Id; items: { productId: Id; quantity: number; comment?: string }[] }[];
}

export interface QuoteGroupOrderDto {
  addressId?: Id;
  point?: LatLngDto;
  couponCode?: string;
  stores: { storeId: Id; items: { productId: Id; quantity: number }[] }[];
}

export interface CreateOrderDto {
  storeId: Id;
  addressId: Id;
  paymentMethod: PaymentMethod;
  comment?: string;
  vendorComment?: string;
  substitutionPolicy?: SubstitutionPolicy;
  couponCode?: string;
  scheduledFor?: string;
  recipientName?: string;
  recipientPhone?: string;
  /** Omit to take the current cart for that store. */
  items?: { productId: Id; quantity: number; comment?: string }[];
}

/** What a storefront asks before committing: the fee and total for a basket at an address. */
export interface QuoteOrderDto {
  storeId: Id;
  addressId?: Id;
  /** The address is not saved yet: quote by point instead. */
  point?: LatLngDto;
  couponCode?: string;
  /** Omit to price the current cart for that store. */
  items?: { productId: Id; quantity: number }[];
}

export interface OrderQuoteDto {
  deliverable: boolean;
  /** Why not, when it is not: outside every zone, below the minimum, store closed. */
  reason: string | null;
  distanceMeters: number;
  etaMinutes: number;
  totals: OrderTotalsDto;
  minOrder: MoneyDto;
  /** Add this much more and delivery is free; null when the zone has no such rule. */
  freeDeliveryThreshold: MoneyDto | null;
  /** Over the car threshold: a car courier is required and the surcharge is in the fee. */
  heavy: boolean;
  heavySurcharge: MoneyDto;
}

export interface CancelOrderDto {
  reason: string;
}

export interface ChangeOrderStatusDto {
  status: OrderStatus;
  comment?: string;
}

export interface OrderListQuery {
  status?: OrderStatus | OrderStatus[];
  customerId?: Id;
  courierId?: Id;
  storeId?: Id;
  cityId?: Id;
  from?: string;
  to?: string;
  search?: string;
  activeOnly?: boolean;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
}

/** One line in the order's chat between the customer and the courier. */
export interface ChatMessageDto {
  id: Id;
  orderId: Id;
  senderUserId: Id;
  senderRole: 'CUSTOMER' | 'COURIER' | 'STAFF';
  text: string;
  createdAt: string;
}
