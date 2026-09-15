/**
 * Cart module-internal types & DTOs.
 */
import type { Money } from '@bazar/payments';

export interface AddItemInput {
  storeId: string;
  productId: string;
  quantity: number;
  comment?: string | undefined;
}

export interface CartLine {
  id: string;
  productId: string;
  name: Record<string, string>;
  unit: string;
  quantity: number;
  /** Price captured when the item was added. */
  unitPrice: Money;
  /** Price the catalog quotes right now. */
  currentPrice: Money;
  total: Money;
  comment: string | null;
  available: boolean;
  priceChanged: boolean;
}

export interface CartView {
  id: string;
  storeId: string;
  items: CartLine[];
  subtotal: Money;
  itemCount: number;
  hasPriceChanges: boolean;
  hasUnavailable: boolean;
  expiresAt: Date;
}
