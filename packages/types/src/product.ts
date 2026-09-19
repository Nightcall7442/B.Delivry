/**
 * product types / DTOs.
 */
import type { ProductUnit, StoreTag } from '@bazar/constants';
import type { Id, ImageDto, MoneyDto, TenantEntity, Translated } from './common.js';

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
  oldPrice?: MoneyDto;
  minQuantity?: number;
  quantityStep?: number;
  weightGrams?: number;
  images?: ImageDto[];
  stock?: number;
}

export type UpdateProductDto = Partial<Omit<CreateProductDto, 'storeId'>> & {
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
}
