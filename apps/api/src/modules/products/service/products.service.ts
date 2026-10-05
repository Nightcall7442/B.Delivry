/**
 * Products business logic. Vendor-side catalog management and price history.
 */
import type { ProductUnit } from '@bazar/constants';
import {
  LIMITS,
  PERMISSION,
  PRODUCT_UNIT,
  RESTRICTED_CATEGORY_SLUGS,
  SALE,
} from '@bazar/constants';
import type { Money } from '@bazar/payments';
import { slugify } from '@bazar/utils';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../common/errors/domain.errors.js';
import { createEvent } from '../../../events/event-bus.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CacheStore } from '../../../infrastructure/redis/cache.js';
import { currentViewer } from '../../catalog/domain/visibility.js';
import type { StoresService } from '../../stores/service/stores.service.js';
import type { ProductsRepository, ProductWithImages } from '../repository/products.repository.js';
import { PRODUCT_EVENT } from '../domain/product.events.js';
import type { CreateProductInput, ProductListFilters, UpdateProductInput } from '../types/index.js';

const DAY_MS = 86_400_000;

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

  /** The loader for the owner's own writes below, which then check who owns the stall. */
  async get(id: string): Promise<ProductWithImages> {
    const product = await this.repository.findById(id);
    if (product === null) throw new NotFoundError('Product', id);
    return product;
  }

  /**
   * What the read endpoint may show: the owner's product in any state, anyone else's only while it
   * is on sale in a stall the public may see. The rest is NotFound, so an id cannot be probed.
   */
  async getVisible(id: string): Promise<ProductWithImages> {
    const product = await this.repository.findVisibleById(id);
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

    const updated = await this.repository.update(
      id,
      { ...input, ...this.oldPriceAfter(product, input) },
      this.currentUser().id,
    );

    if (input.images !== undefined) {
      await this.repository.replaceImages(id, input.images);
    }

    await this.invalidate(product.storeId);
    return this.get(updated.id);
  }

  /**
   * The struck-through price only ever stands above the price. One typed at or below it is a
   * mistake; a price raised to it or past it ends the sale by itself, rather than leaving a
   * «discount» that is a markup.
   */
  private oldPriceAfter(
    product: { price: number; oldPrice: number | null; currency: string },
    input: UpdateProductInput,
  ): { oldPrice?: Money | null } {
    const price = input.price?.amount ?? product.price;
    if (input.oldPrice !== undefined && input.oldPrice !== null && input.oldPrice.amount <= price) {
      throw new ValidationError({ oldPrice: ['The old price must be higher than the price'] });
    }
    if (input.oldPrice !== undefined) return { oldPrice: input.oldPrice };
    if (product.oldPrice !== null && product.oldPrice <= price) return { oldPrice: null };
    return {};
  }

  /**
   * «Честная скидка». The seller types the new price only; the struck-through one is what the good
   * cost — the lowest price of the last `SALE.REFERENCE_DAYS` days, from the price history — so a
   * price raised yesterday to be «cut» today shows no discount at all. A good already on sale keeps
   * the price its sale started from; a new cut must go below it. Customers who saved the good hear
   * about it (see the favorites sale handler).
   */
  async startSale(id: string, price: Money): Promise<ProductWithImages> {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);
    if (price.currency !== product.currency) {
      throw new ValidationError({ price: [`The price must be in ${product.currency}`] });
    }
    const before = product.price;
    const since = new Date(Date.now() - SALE.REFERENCE_DAYS * DAY_MS);
    const lowest = await this.repository.lowestPriceSince(id, since);
    const reference = product.oldPrice ?? Math.min(lowest ?? product.price, product.price);
    if (price.amount >= reference) {
      throw new ConflictError(
        `A sale price must be below ${reference}: the lowest price of the last ${SALE.REFERENCE_DAYS} days`,
      );
    }

    const updated = await this.repository.setSale(
      id,
      { price: price.amount, oldPrice: reference, currency: product.currency },
      this.currentUser().id,
    );
    await this.invalidate(product.storeId);
    // A deeper cut is news; the same price again or a shallower one is not.
    if (price.amount < before) {
      await this.publish(
        createEvent(PRODUCT_EVENT.SALE_STARTED, {
          productId: id,
          storeId: product.storeId,
          name: product.name as Record<string, string>,
          price: price.amount,
          oldPrice: reference,
          currency: product.currency,
          imageUrl: product.images[0]?.url ?? null,
        }),
      );
    }
    return updated;
  }

  /** The sale is over: the struck-through price is the price again. Not on sale = nothing to do. */
  async endSale(id: string): Promise<ProductWithImages> {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);
    if (product.oldPrice === null) return product;
    const updated = await this.repository.setSale(
      id,
      { price: product.oldPrice, oldPrice: null, currency: product.currency },
      this.currentUser().id,
    );
    await this.invalidate(product.storeId);
    return updated;
  }

  /** Alcohol and tobacco are not sold through the app: refused on the way in, whatever the store. */
  private async assertAllowedCategory(categoryId: string | undefined): Promise<void> {
    if (categoryId === undefined) return;
    const slug = await this.repository.categorySlug(categoryId);
    if (slug === null) throw new NotFoundError('Category', categoryId);
    if (RESTRICTED_CATEGORY_SLUGS.includes(slug)) {
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

  /**
   * Who changed the price, and when, is the stall's and the desk's: `product:write` is held by
   * every vendor for the whole tenant, so it alone let any of them read any other's history.
   */
  async priceHistory(id: string) {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);
    return this.repository.priceHistory(id);
  }

  /**
   * Writing to a store's catalogue requires owning that store, or being staff. The desk owns no
   * stall and edits any shelf of the tenant (it still needs `product:write`, which operators lack);
   * a vendor — and a token with no vendorId is no vendor — only their own.
   */
  private async assertOwnsStore(storeId: string): Promise<void> {
    const store = await this.stores.get(storeId);
    this.authorize(
      PERMISSION.PRODUCT_WRITE,
      currentViewer().staff ? undefined : { tenantId: store.tenantId, vendorId: store.vendorId },
    );
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
