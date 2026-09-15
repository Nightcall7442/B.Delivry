/**
 * Products business logic. Vendor-side catalog management and price history.
 */
import { LIMITS, PERMISSION } from '@bazar/constants';
import { slugify } from '@bazar/utils';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ConflictError, NotFoundError } from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CacheStore } from '../../../infrastructure/redis/cache.js';
import type { StoresService } from '../../stores/service/stores.service.js';
import type { ProductsRepository, ProductWithImages } from '../repository/products.repository.js';
import type { CreateProductInput, ProductListFilters, UpdateProductInput } from '../types/index.js';

export interface ProductsServiceDeps extends ServiceDeps {
  repository: ProductsRepository;
  stores: StoresService;
  cache: CacheStore;
}

export class ProductsService extends BaseService {
  private readonly repository: ProductsRepository;
  private readonly stores: StoresService;
  private readonly cache: CacheStore;

  constructor(deps: ProductsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.stores = deps.stores;
    this.cache = deps.cache;
  }

  async list(filters: ProductListFilters): Promise<PaginatedResult<ProductWithImages>> {
    return this.repository.list(filters);
  }

  async get(id: string): Promise<ProductWithImages> {
    const product = await this.repository.findById(id);
    if (product === null) throw new NotFoundError('Product', id);
    return product;
  }

  async create(input: CreateProductInput): Promise<ProductWithImages> {
    await this.assertOwnsStore(input.storeId);

    if ((input.images ?? []).length > LIMITS.PRODUCT_MAX_IMAGES) {
      throw new ConflictError(`At most ${LIMITS.PRODUCT_MAX_IMAGES} images per product`);
    }

    // Slug generated once from the first available name and kept forever, so
    // links and search stay stable when the seller renames the product.
    const base = input.name.uz ?? input.name.ru ?? input.name.en ?? 'product';
    const slug = `${slugify(base)}-${Date.now().toString(36).slice(-4)}`;

    const product = await this.repository.create(input, slug);
    await this.invalidate(input.storeId);
    return product;
  }

  async update(id: string, input: UpdateProductInput): Promise<ProductWithImages> {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);

    const updated = await this.repository.update(id, input, this.currentUser().id);

    if (input.images !== undefined) {
      await this.repository.replaceImages(id, input.images);
    }

    await this.invalidate(product.storeId);
    return this.get(updated.id);
  }

  /**
   * The button a seller actually uses: goods run out mid-morning at a bazaar
   * and go back on sale in the afternoon.
   */
  async setAvailability(id: string, available: boolean): Promise<void> {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);
    await this.repository.setAvailability(id, available);
    await this.invalidate(product.storeId);
  }

  async remove(id: string): Promise<void> {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);
    await this.repository.softDelete(id);
    await this.invalidate(product.storeId);
  }

  async priceHistory(id: string) {
    const product = await this.get(id);
    this.authorize(PERMISSION.PRODUCT_WRITE, { tenantId: product.tenantId });
    return this.repository.priceHistory(id);
  }

  /** Writing to a store's catalogue requires owning that store, or being staff. */
  private async assertOwnsStore(storeId: string): Promise<void> {
    const store = await this.stores.get(storeId);
    this.authorize(PERMISSION.PRODUCT_WRITE, {
      tenantId: store.tenantId,
      vendorId: store.vendorId,
    });
  }

  private async invalidate(storeId: string): Promise<void> {
    await this.cache.invalidateByTag(`store:${storeId}`);
    await this.cache.invalidateByTag('categories');
  }
}
