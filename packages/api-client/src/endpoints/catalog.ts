/** Endpoint functions for /categories and /products. */
import type { CategoryDto, ProductDto, ProductListQuery, UpdateProductDto } from '@bazar/types';

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
  setAvailability: (id: string, available: boolean) =>
    http.request<ProductDto>('PUT', `/products/${id}/availability`, { body: { available } }),
});
