/**
 * product types / DTOs.
 */
import type { ProductUnit, StoreTag } from '@bazar/constants';
import type { Id, ImageDto, MoneyDto, TenantEntity, Translated } from './common.js';

/**
 * A quantity price: from `minQuantity` (in the product's unit) the whole line is priced at `price`
 * per unit — «от 10 кг по 16 000», «3 шт за 10 000» (stored per piece). Never above the list price.
 */
export interface PriceTierDto {
  minQuantity: number;
  price: MoneyDto;
}

export interface ProductDto extends TenantEntity {
  storeId: Id;
  categoryId: Id | null;
  name: Translated;
  description: Translated | null;
  slug: string;
  unit: ProductUnit;
  /** Price per `unit`. For KG goods this is the price of one kilogram. */
  price: MoneyDto;
  oldPrice: MoneyDto | null;
  /** Wholesale and «3 за …» prices, by `minQuantity` ascending; absent or empty = none. */
  priceTiers?: PriceTierDto[];
  /** Smallest amount a customer may order, in units (0.5 kg, 1 pcs). */
  minQuantity: number;
  quantityStep: number;
  /** Grams per unit: feeds courier vehicle capacity checks. */
  weightGrams: number | null;
  images: ImageDto[];
  available: boolean;
  /** null = the seller does not track stock (typical for a bazaar stall). */
  stock: number | null;
  rating: number;
  reviewCount: number;
  /** The vendor marked it as arrived today; null or older than a day = nothing special. */
  arrivedAt: string | null;
  tags: StoreTag[];
}

export interface ProductSummaryDto {
  id: Id;
  storeId: Id;
  name: Translated;
  price: MoneyDto;
  oldPrice: MoneyDto | null;
  unit: ProductUnit;
  imageUrl: string | null;
  available: boolean;
}

export interface CreateProductDto {
  storeId: Id;
  categoryId?: Id;
  name: Translated;
  description?: Translated;
  unit: ProductUnit;
  price: MoneyDto;
  minQuantity?: number;
  quantityStep?: number;
  weightGrams?: number;
  images?: ImageDto[];
  stock?: number;
}

export type UpdateProductDto = Partial<Omit<CreateProductDto, 'storeId'>> & {
  /** Only null: ends a sale. A sale starts through the sale endpoint, never with a typed price. */
  oldPrice?: null;
  available?: boolean;
  tags?: StoreTag[];
};

export interface ProductListQuery {
  /** Exactly these products (the basket), any store. */
  ids?: Id[];
  storeId?: Id;
  categoryId?: Id;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  availableOnly?: boolean;
  /** Only goods with a struck-through price. */
  onSale?: boolean;
}
