/**
 * Product events: a good went on sale, a good is back on the counter.
 */
export const PRODUCT_EVENT = {
  /** A sale started or went deeper: the struck-through price now stands above the price. */
  SALE_STARTED: 'product.sale_started',
  /** It could not be bought (switched off, or its counted stock ran out) and now it can. */
  BACK_IN_STOCK: 'product.back_in_stock',
} as const;

export type ProductEventName = (typeof PRODUCT_EVENT)[keyof typeof PRODUCT_EVENT];

export interface ProductEventPayloads {
  'product.sale_started': {
    productId: string;
    storeId: string;
    name: Record<string, string>;
    price: number;
    oldPrice: number;
    currency: string;
    imageUrl: string | null;
  };
  'product.back_in_stock': {
    productId: string;
    storeId: string;
    name: Record<string, string>;
    price: number;
    currency: string;
    imageUrl: string | null;
  };
}
