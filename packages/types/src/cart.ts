/**
 * cart types / DTOs.
 */
import type { Id, MoneyDto, TenantEntity } from './common.js';
import type { ProductSummaryDto } from './product.js';

export interface CartItemDto {
  id: Id;
  productId: Id;
  product: ProductSummaryDto;
  quantity: number;
  /** Price captured when the item was added; refreshed on checkout. */
  unitPrice: MoneyDto;
  total: MoneyDto;
  comment: string | null;
  available: boolean;
}

/**
 * One cart per store: a bazaar order is picked up at a single stall, so mixing
 * stores would mean several courier trips under one order.
 */
export interface CartDto extends TenantEntity {
  customerId: Id;
  storeId: Id;
  items: CartItemDto[];
  subtotal: MoneyDto;
  itemCount: number;
  /** Set when a listed price moved since the item was added. */
  hasPriceChanges: boolean;
  expiresAt: string;
}

export interface AddCartItemDto {
  storeId: Id;
  productId: Id;
  quantity: number;
  comment?: string;
}

export interface UpdateCartItemDto {
  quantity: number;
  comment?: string;
}
