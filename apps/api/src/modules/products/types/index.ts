/**
 * Products module-internal types & DTOs.
 */
import type { ProductUnit } from '@bazar/constants';
import type { Money } from '@bazar/payments';

export interface CreateProductInput {
  storeId: string;
  categoryId?: string | undefined;
  name: Record<string, string>;
  description?: Record<string, string> | undefined;
  unit: ProductUnit;
  price: Money;
  oldPrice?: Money | undefined;
  minQuantity?: number | undefined;
  quantityStep?: number | undefined;
  weightGrams?: number | undefined;
  images?: { url: string; width?: number; height?: number; alt?: string }[] | undefined;
  stock?: number | undefined;
}

export type UpdateProductInput = Partial<Omit<CreateProductInput, 'storeId'>> & {
  available?: boolean;
  tags?: string[] | undefined;
};

export interface ProductListFilters {
  storeId?: string | undefined;
  categoryId?: string | undefined;
  search?: string | undefined;
  availableOnly?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}
