/**
 * Catalog module-internal types & DTOs.
 */
import type { ProductUnit } from '@bazar/constants';

/**
 * A product as the order flow needs it: enough to price a line and check it
 * can actually be sold, and nothing else.
 */
export interface PurchasableProduct {
  id: string;
  storeId: string;
  slug: string;
  name: Record<string, string>;
  unit: ProductUnit;
  price: number;
  currency: string;
  minQuantity: number;
  quantityStep: number;
  weightGrams: number | null;
  /** null = the seller does not track stock. */
  stock: number | null;
}

export interface CatalogSearchFilters {
  storeId?: string | undefined;
  categoryId?: string | undefined;
  search?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  availableOnly?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}
