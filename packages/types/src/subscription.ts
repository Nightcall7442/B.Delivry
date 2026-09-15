/**
 * Cart subscription DTOs: the same basket placed automatically every week.
 */
import type { PaymentMethod, ProductUnit } from '@bazar/constants';

import type { Id, TenantEntity, Translated } from './common.js';

export interface SubscriptionItemDto {
  productId: Id;
  name: Translated;
  unit: ProductUnit;
  quantity: number;
}

export interface CartSubscriptionDto extends TenantEntity {
  customerId: Id;
  storeId: Id;
  storeName: Translated;
  addressId: Id;
  addressText: string;
  paymentMethod: PaymentMethod;
  items: SubscriptionItemDto[];
  /** Local weekday, 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Start hour of the delivery window. */
  hour: number;
  active: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastOrderId: Id | null;
  lastError: string | null;
}

export interface CreateSubscriptionDto {
  orderId: Id;
  weekday: number;
  hour: number;
}

export interface UpdateSubscriptionDto {
  active?: boolean;
  weekday?: number;
  hour?: number;
}
