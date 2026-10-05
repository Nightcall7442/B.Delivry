/** Endpoint functions for /categories and /products. */
import type {
  CategoryDto,
  MoneyDto,
  ProductDto,
  ProductListQuery,
  UpdateProductDto,
} from '@bazar/types';

import type { Http } from '../client.js';
import type { PageQuery } from './page.js';

export const catalogApi = (http: Http) => ({
  categories: (query: { parentId?: string; storeId?: string } = {}) =>
    http.request<CategoryDto[]>('GET', '/categories', { query }),
  products: (query: ProductListQuery & PageQuery = {}) =>
    http.paginated<ProductDto>('/catalog', { ...query }),
  product: (id: string) => http.request<ProductDto>('GET', `/catalog/${id}`),
  /** Vendor/staff: the write side of the catalogue. */
  updateProduct: (id: string, body: UpdateProductDto) =>
    http.request<ProductDto>('PATCH', `/products/${id}`, { body }),
  /**
   * «Честная скидка»: the new price only — the struck-through one is the lowest of the last week,
   * from the price history (409 when the new price is not below it).
   */
  startSale: (id: string, price: MoneyDto) =>
    http.request<ProductDto>('PUT', `/products/${id}/sale`, { body: { price } }),
  /**
   * Quantity prices, all at once — «от 10 кг по 16 000», «3 шт за 10 000» kept per piece; [] takes
   * them off. 422 when the ladder does not go down under the list price.
   */
  setTiers: (id: string, tiers: { minQuantity: number; price: MoneyDto }[]) =>
    http.request<ProductDto>('PUT', `/products/${id}/tiers`, { body: { tiers } }),
  /** The struck-through price becomes the price again. */
  endSale: (id: string) => http.request<ProductDto>('DELETE', `/products/${id}/sale`),
  setAvailability: (id: string, available: boolean) =>
    http.request<ProductDto>('PUT', `/products/${id}/availability`, { body: { available } }),
});
