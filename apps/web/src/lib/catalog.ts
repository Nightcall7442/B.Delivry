/**
 * Server-side reads for the storefront pages. Public endpoints only, so the
 * anonymous API client is enough; stores without a map point are dropped
 * because nothing here can show or price them.
 */
import type { MapStoreDto } from '@bazar/storefront';
import type { CategoryDto, ProductDto, StoreDto } from '@bazar/types';

import { serverApi } from '@/lib/api';

const withPoint = (stores: StoreDto[]): MapStoreDto[] =>
  stores.filter((store): store is MapStoreDto => store.point !== null);

export async function listStores(locale: string): Promise<MapStoreDto[]> {
  const page = await serverApi(locale).stores.list({ pageSize: 100 });
  return withPoint(page.items);
}

export async function getStore(locale: string, id: string): Promise<MapStoreDto | null> {
  try {
    const store = await serverApi(locale).stores.get(id);
    return store.point ? (store as MapStoreDto) : null;
  } catch {
    return null;
  }
}

export async function listCategories(locale: string): Promise<CategoryDto[]> {
  return serverApi(locale).catalog.categories();
}

export async function listProducts(
  locale: string,
  query: { storeId?: string; categoryId?: string; search?: string } = {},
): Promise<ProductDto[]> {
  const page = await serverApi(locale).catalog.products({ ...query, pageSize: 100 });
  return page.items;
}

/** One page of a shop's shelf — the shop screen scrolls through these. */
export async function listProductPage(
  locale: string,
  query: { storeId: string; categoryId?: string; search?: string; page?: number },
) {
  return serverApi(locale).catalog.products({ ...query, pageSize: SHELF_PAGE });
}

/** The shelves of one shop: only the categories with goods on sale there. */
export async function listShelves(locale: string, storeId: string): Promise<CategoryDto[]> {
  return serverApi(locale).catalog.categories({ storeId });
}

export const SHELF_PAGE = 24;
