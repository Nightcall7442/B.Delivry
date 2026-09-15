/**
 * Orders module-internal types & DTOs.
 */
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductUnit,
  SubstitutionPolicy,
} from '@bazar/constants';
import type { Money } from '@bazar/payments';

export interface OrderItemInput {
  productId: string;
  quantity: number;
  comment?: string | undefined;
}

export interface CreateOrderInput {
  storeId: string;
  addressId: string;
  paymentMethod: PaymentMethod;
  comment?: string | undefined;
  vendorComment?: string | undefined;
  substitutionPolicy?: SubstitutionPolicy | undefined;
  couponCode?: string | undefined;
  scheduledFor?: Date | undefined;
  recipientName?: string | undefined;
  recipientPhone?: string | undefined;
  /** Cross-bazaar: shared by the orders of one trip; set by `createGroup`. */
  groupId?: string | undefined;
  /** A follower in a group: the leading order already carries the delivery fee. */
  groupFollower?: boolean | undefined;
  /** The leader of a group: the whole trip's goods (minor units) count towards free delivery. */
  groupSubtotal?: number | undefined;
  /** Omitted means "take the cart for this store". */
  items?: OrderItemInput[] | undefined;
}

/** An item as it will be frozen onto the order, priced and named at that moment. */
export interface PricedItem {
  productId: string;
  name: Record<string, string>;
  unit: ProductUnit;
  quantity: number;
  unitPrice: Money;
  total: Money;
  comment: string | null;
  weightGrams: number | null;
}

export interface OrderTotals {
  subtotal: Money;
  deliveryFee: Money;
  serviceFee: Money;
  discount: Money;
  total: Money;
}

export interface OrderListFilters {
  status?: OrderStatus | OrderStatus[] | undefined;
  customerId?: string | undefined;
  courierId?: string | undefined;
  storeId?: string | undefined;
  /** Every store of one vendor — what the vendor panel lists. */
  vendorId?: string | undefined;
  cityId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  activeOnly?: boolean | undefined;
  paymentMethod?: PaymentMethod | undefined;
  paymentStatus?: PaymentStatus | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface ActualQuantity {
  orderItemId: string;
  actualQuantity: number;
  photoUrl?: string | undefined;
}

/** Snapshot of the delivery address, copied onto the order at creation. */
export interface FrozenAddress {
  cityId: string;
  formatted: string;
  street: string | null;
  house: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  landmark: string | null;
  instructions: string | null;
  lat: number | null;
  lng: number | null;
}
