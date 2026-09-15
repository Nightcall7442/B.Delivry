/**
 * Catalog business logic. Customer-facing product browsing, search and purchasability.
 */
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { NotFoundError } from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import { cached, type CacheStore } from '../../../infrastructure/redis/cache.js';
import type { CatalogRepository, ProductWithImages } from '../repository/catalog.repository.js';
import type { CatalogSearchFilters, PurchasableProduct } from '../types/index.js';

export interface CatalogServiceDeps extends ServiceDeps {
  repository: CatalogRepository;
  cache: CacheStore;
}

/** Categories change rarely and are rendered on every screen. */
const CATEGORY_TTL_SECONDS = 1800;

export class CatalogService extends BaseService {
  private readonly repository: CatalogRepository;
  private readonly cache: CacheStore;

  constructor(deps: CatalogServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.cache = deps.cache;
  }

  /**
   * Reads live, never cached: this is what an order is priced from, and a
   * stale price here is a price the customer did not agree to.
   */
  async getPurchasable(storeId: string, ids: string[]): Promise<Map<string, PurchasableProduct>> {
    return this.repository.findPurchasable(storeId, [...new Set(ids)]);
  }

  async get(id: string): Promise<ProductWithImages> {
    const product = await this.repository.findById(id);
    if (product === null) throw new NotFoundError('Product', id);
    return product;
  }

  async search(filters: CatalogSearchFilters): Promise<PaginatedResult<ProductWithImages>> {
    return this.repository.search(filters);
  }

  async categories(parentId?: string | null) {
    return cached(
      this.cache,
      `categories:${parentId ?? 'root'}`,
      CATEGORY_TTL_SECONDS,
      () => this.repository.listCategories(parentId),
      ['categories'],
    );
  }

  /**
   * Reserves stock for a confirmed order. Sellers who do not track stock
   * (stock === null) always succeed; that is the normal case at a bazaar.
   */
  async reserve(items: { productId: string; quantity: number }[]): Promise<void> {
    for (const item of items) {
      const product = await this.repository.findById(item.productId);
      if (product === null || product.stock === null) continue;
      await this.repository.decrementStock(item.productId, item.quantity);
    }
  }
}
