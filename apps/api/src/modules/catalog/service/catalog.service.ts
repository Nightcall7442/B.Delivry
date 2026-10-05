/**
 * Catalog business logic. Customer-facing product browsing, search and purchasability.
 */
import { DEFAULT_CURRENCY } from '@bazar/constants';
import { buildPriceIndex, isShopfront } from '@bazar/storefront';
import type { PriceIndexDto } from '@bazar/types';
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
/** «Индекс базара»: stalls set their prices in the morning; half an hour behind is still today. */
const PRICE_INDEX_TTL_SECONDS = 1800;
/** How far back the index draws its weekly line. */
const PRICE_INDEX_WEEKS = 8;

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

  /** What the storefront may open: see `CatalogRepository.findVisibleById`. A hidden one is NotFound. */
  async get(id: string): Promise<ProductWithImages> {
    const product = await this.repository.findVisibleById(id);
    if (product === null) throw new NotFoundError('Product', id);
    return product;
  }

  async search(filters: CatalogSearchFilters): Promise<PaginatedResult<ProductWithImages>> {
    return this.repository.search(filters);
  }

  async categories(parentId?: string | null) {
    // The parent is part of the cache key, and it comes from the query string of an anonymous
    // caller: an unknown one answers empty without leaving an entry behind.
    if (
      parentId !== undefined &&
      parentId !== null &&
      !(await this.repository.categoryExists(parentId))
    ) {
      return [];
    }
    return cached(
      this.cache,
      `categories:${parentId ?? 'root'}`,
      CATEGORY_TTL_SECONDS,
      () => this.repository.listCategories(parentId),
      ['categories'],
    );
  }

  /**
   * «Индекс базара» of a city — the one asked for when it has live stalls, else the busiest one.
   * Public and cached: the id of an unknown city never becomes a cache key of its own.
   */
  async priceIndex(cityId?: string): Promise<PriceIndexDto> {
    const tenantId = this.tenantId();
    const cities = await cached(
      this.cache,
      `price-index:cities:${tenantId}`,
      PRICE_INDEX_TTL_SECONDS,
      () => this.repository.indexCities(),
      ['price-index'],
    );
    const city = cities.find((place) => place.id === cityId) ?? cities[0];
    if (city === undefined) {
      return {
        ...buildPriceIndex([], { currency: DEFAULT_CURRENCY }),
        cities: [],
      };
    }
    return cached(
      this.cache,
      `price-index:${tenantId}:${city.id}`,
      PRICE_INDEX_TTL_SECONDS,
      async () => {
        const now = new Date();
        const since = new Date(now.getTime() - PRICE_INDEX_WEEKS * 7 * 86_400_000);
        const goods = await this.repository.indexGoods(city.id, since);
        const index = buildPriceIndex(
          goods.map((good) => ({
            nameRu: (good.name as Record<string, string | undefined>)['ru'] ?? '',
            unit: good.unit,
            price: good.price,
            currency: good.currency,
            storeId: good.storeId,
            shop: isShopfront(good.store),
            createdAt: good.createdAt,
            history: good.history,
          })),
          { now, weeks: PRICE_INDEX_WEEKS, currency: DEFAULT_CURRENCY, city },
        );
        return { ...index, cities };
      },
      ['price-index'],
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
