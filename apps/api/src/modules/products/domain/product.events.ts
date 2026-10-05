/**
 * Product events: a good went on sale.
 */
export const PRODUCT_EVENT = {
  /** A sale started or went deeper: the struck-through price now stands above the price. */
  SALE_STARTED: 'product.sale_started',
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
}
