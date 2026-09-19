/**
 * Products business logic. Vendor-side catalog management and price history.
 */
import type { ProductUnit } from '@bazar/constants';
import { LIMITS, PERMISSION, PRODUCT_UNIT, RESTRICTED_CATEGORY_SLUGS } from '@bazar/constants';
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
    await this.assertAllowedCategory(input.categoryId);

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
    await this.assertAllowedCategory(input.categoryId);

    const updated = await this.repository.update(id, input, this.currentUser().id);

    if (input.images !== undefined) {
      await this.repository.replaceImages(id, input.images);
    }

    await this.invalidate(product.storeId);
    return this.get(updated.id);
  }

  /** Alcohol and tobacco are not sold through the app: refused on the way in, whatever the store. */
  private async assertAllowedCategory(categoryId: string | undefined): Promise<void> {
    if (categoryId === undefined) return;
    const slug = await this.repository.categorySlug(categoryId);
    if (slug !== null && RESTRICTED_CATEGORY_SLUGS.includes(slug)) {
      throw new ConflictError('This category is not sold through the app');
    }
  }

  /**
   * A shop's whole shelf from one spreadsheet: `name_ru;name_uz;price;unit;category;image_url;
   * stock;weight_grams;old_price` (tab, comma or semicolon separated, header row required).
   * Rows are matched to existing products by the Russian name inside the store, so a re-upload
   * updates prices and stock instead of duplicating. Rows without a photo are skipped and counted.
   */
  async importCsv(
    storeId: string,
    csv: string,
  ): Promise<{ created: number; updated: number; skipped: string[] }> {
    await this.assertOwnsStore(storeId);
    const rows = parseCsv(csv);
    const categories = await this.repository.categoryIdsBySlug();
    const result = { created: 0, updated: 0, skipped: [] as string[] };
    for (const [line, row] of rows.entries()) {
      const nameRu = row['name_ru']?.trim();
      const price = Math.round(Number(row['price']) * 100);
      const unit = (row['unit'] ?? 'PCS').trim().toUpperCase();
      const image = row['image_url']?.trim();
      const categorySlug = row['category']?.trim();
      if (!nameRu || !Number.isFinite(price) || price <= 0) {
        result.skipped.push(`${line + 2}: name_ru/price`);
        continue;
      }
      if (!image) {
        result.skipped.push(`${line + 2}: image_url`);
        continue;
      }
      if (categorySlug && RESTRICTED_CATEGORY_SLUGS.includes(categorySlug)) {
        result.skipped.push(`${line + 2}: restricted`);
        continue;
      }
      if (!Object.values<string>(PRODUCT_UNIT).includes(unit)) {
        result.skipped.push(`${line + 2}: unit`);
        continue;
      }
      const categoryId = categorySlug ? categories.get(categorySlug) : undefined;
      const oldPrice = row['old_price'] ? Math.round(Number(row['old_price']) * 100) : undefined;
      const stock = row['stock'] ? Number(row['stock']) : undefined;
      const weightGrams = row['weight_grams'] ? Math.round(Number(row['weight_grams'])) : undefined;
      const input: CreateProductInput = {
        storeId,
        ...(categoryId !== undefined ? { categoryId } : {}),
        name: { ru: nameRu, uz: row['name_uz']?.trim() || nameRu },
        unit: unit as ProductUnit,
        price: { amount: price, currency: 'UZS' },
        ...(oldPrice !== undefined && oldPrice > price
          ? { oldPrice: { amount: oldPrice, currency: 'UZS' } }
          : {}),
        images: [{ url: image }],
        ...(stock !== undefined && Number.isFinite(stock) ? { stock } : {}),
        ...(weightGrams !== undefined && Number.isFinite(weightGrams) ? { weightGrams } : {}),
      };
      const existing = await this.repository.findByNameRu(storeId, nameRu);
      if (existing === null) {
        await this.create(input);
        result.created += 1;
      } else {
        const { storeId: _storeId, ...rest } = input;
        await this.update(existing, { ...rest, available: true });
        result.updated += 1;
      }
    }
    return result;
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

/** Header-keyed rows; the delimiter is whichever of tab / semicolon / comma the header uses most. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];
  const header = lines[0]!;
  const delimiter = ['\t', ';', ','].sort(
    (a, b) => header.split(b).length - header.split(a).length,
  )[0]!;
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        out.push(cell);
        cell = '';
      } else cell += ch;
    }
    out.push(cell);
    return out;
  };
  const keys = split(header).map((key) => key.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? '']));
  });
}
