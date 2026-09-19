/**
 * Catalogue reads for the screens: the same four calls the fixtures offered,
 * answered by the API. Stores without a map point are dropped because nothing
 * here can show or price them.
 */
import { api } from '@bazar/mobile';
import type { MapStoreDto } from '@bazar/storefront';
import type { CategoryDto, ProductDto, StoreDto } from '@bazar/types';

const withPoint = (stores: StoreDto[]): MapStoreDto[] =>
  stores.filter((store): store is MapStoreDto => store.point !== null);

export async function listStores(): Promise<MapStoreDto[]> {
  const page = await api().stores.list({ pageSize: 100 });
  return withPoint(page.items);
}

export async function getStore(id: string): Promise<MapStoreDto | null> {
  try {
    const store = await api().stores.get(id);
    return store.point ? (store as MapStoreDto) : null;
  } catch {
    return null;
  }
}

export async function listCategories(): Promise<CategoryDto[]> {
  return api().catalog.categories();
}

export async function listProducts(
  query: { storeId?: string; categoryId?: string; search?: string } = {},
): Promise<ProductDto[]> {
  const page = await api().catalog.products({ ...query, pageSize: 100 });
  return page.items;
}

/** The basket's own products, sold out ones included, so every line can be priced. */
export async function listProductsByIds(ids: readonly string[]): Promise<ProductDto[]> {
  if (ids.length === 0) return [];
  const page = await api().catalog.products({ ids: [...ids], availableOnly: false, pageSize: 100 });
  return page.items;
}

export async function getProduct(id: string): Promise<ProductDto | null> {
  try {
    return await api().catalog.product(id);
  } catch {
    return null;
  }
}
