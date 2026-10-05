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
import { MAX_PRICE_TIERS, isFractionalUnit, tierProblem } from '@bazar/storefront';
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

const TIER_PROBLEM = {
  tooMany: `At most ${MAX_PRICE_TIERS} quantity prices`,
  quantity: 'A quantity price starts above the smallest order',
  price: 'A quantity price is a whole amount below the list price',
  order: 'Each larger quantity must be cheaper per unit than the one before',
} as const;

interface Buyable {
  available: boolean;
  stock: { toString(): string } | number | null;
}
/** On the counter for a customer: switched on, and some left when the seller counts it. */
const buyable = (product: Buyable): boolean =>
  product.available && (product.stock === null || Number(product.stock) > 0);

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
    const fresh = await this.get(updated.id);
    // A refill — stock typed in again, or a spreadsheet row — puts it back on the counter. Read
    // after the images were replaced, so the push carries the photo the shelf now has.
    await this.announceIfBack(product, fresh);
    return fresh;
  }

  /**
   * An edit may end a sale (null), never start or move one: a price changed by an edit during a
   * sale ends it. Otherwise a lower price kept a struck price nobody checked against the week (a
   * deeper cut goes through `startSale`), and a price nudged every few days kept the week's sweep
   * from ever ending the sale.
   */
  private oldPriceAfter(
    product: { price: number; oldPrice: number | null },
    input: UpdateProductInput,
  ): { oldPrice?: null } {
    if (input.oldPrice === null) return { oldPrice: null };
    if (
      product.oldPrice !== null &&
      input.price !== undefined &&
      input.price.amount !== product.price
    ) {
      return { oldPrice: null };
    }
    return {};
  }

  /**
   * «Честная скидка». The seller types the new price only; the struck-through one is what the good
   * cost — the lowest price of the last `SALE.REFERENCE_DAYS` days, from the price history — so a
   * price raised yesterday to be «cut» today shows no discount at all. The reference is measured
   * anew on every cut, sale prices included: a deeper cut is struck through at the price it cut, and
   * a sale that has run past the week no longer leans on the price it started from. Customers who
   * saved the good hear about it (see the favorites sale handler).
   */
  async startSale(id: string, price: Money): Promise<ProductWithImages> {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);
    if (price.currency !== product.currency) {
      throw new ValidationError({ price: [`The price must be in ${product.currency}`] });
    }
    const since = new Date(Date.now() - SALE.REFERENCE_DAYS * DAY_MS);
    const lowest = await this.repository.lowestPriceSince(id, since);
    const reference = Math.min(
      lowest ?? product.price,
      product.price,
      product.oldPrice ?? Number.POSITIVE_INFINITY,
    );
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
    // Every accepted cut is below the price of the moment, so it is news — to a public stall's
    // customers only.
    if (await this.stores.isPublic(product.storeId)) {
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

  /**
   * A sale left alone for the whole reference week ends by itself: by then the lowest price of the
   * week is the sale price, and the struck one is a price nobody has been charged in seven days —
   * the very claim the honest sale refuses. The price stays; only the struck price goes. Run by the
   * scheduler, in batches; returns how many ended.
   */
  async endStaleSales(now: Date = new Date(), batch = 500): Promise<number> {
    const since = new Date(now.getTime() - SALE.REFERENCE_DAYS * DAY_MS);
    let ended = 0;
    for (;;) {
      const stale = await this.repository.staleSales(since, batch);
      if (stale.length === 0) break;
      const count = await this.repository.endStaleSales(
        stale.map((product) => product.id),
        since,
      );
      ended += count;
      for (const storeId of new Set(stale.map((product) => product.storeId))) {
        await this.invalidate(storeId);
      }
      // A short page was the last; a page none of which ended (all cut again meanwhile) would
      // come back the same.
      if (stale.length < batch || count === 0) break;
    }
    return ended;
  }

  /**
   * Quantity prices — «от 10 кг по 16 000» for the café buying by the sack, «3 шт за 10 000» for the
   * third melon — set all at once, an empty list taking them off. A ladder down from above the
   * smallest order, under the list price, three steps at most (@bazar/storefront tierProblem, the
   * same answer the seller's sheet gives). Orders and the clients price lines by it.
   */
  async setTiers(
    id: string,
    input: readonly { minQuantity: number; price: Money }[],
  ): Promise<ProductWithImages> {
    const product = await this.get(id);
    await this.assertOwnsStore(product.storeId);
    if (input.some((tier) => tier.price.currency !== product.currency)) {
      throw new ValidationError({ tiers: [`Tier prices must be in ${product.currency}`] });
    }
    const tiers = input.map((tier) => ({
      minQuantity: tier.minQuantity,
      price: tier.price.amount,
    }));
    const problem = tierProblem(tiers, {
      price: product.price,
      minQuantity: Number(product.minQuantity),
      whole: !isFractionalUnit(product.unit),
    });
    if (problem !== null) throw new ValidationError({ tiers: [TIER_PROBLEM[problem]] });
    const updated = await this.repository.setTiers(id, tiers);
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
      // «old_price» says «this is on sale»; what it is struck through at is the history's to say.
      const oldPrice = row['old_price'] ? Math.round(Number(row['old_price']) * 100) : undefined;
      const onSale = oldPrice !== undefined && Number.isFinite(oldPrice) && oldPrice > price;
      const stock = row['stock'] ? Number(row['stock']) : undefined;
      const weightGrams = row['weight_grams'] ? Math.round(Number(row['weight_grams'])) : undefined;
      const input: CreateProductInput = {
        storeId,
        ...(categoryId !== undefined ? { categoryId } : {}),
        name: { ru: nameRu, uz: row['name_uz']?.trim() || nameRu },
        unit: unit as ProductUnit,
        price: { amount: price, currency: 'UZS' },
        images: [{ url: image }],
        ...(stock !== undefined && Number.isFinite(stock) ? { stock } : {}),
        ...(weightGrams !== undefined && Number.isFinite(weightGrams) ? { weightGrams } : {}),
      };
      const existing = await this.repository.findByNameRu(storeId, nameRu);
      if (existing === null) {
        await this.create(input);
        result.created += 1;
      } else {
        // A new good has no history to be cheaper than; a known one goes through the honest sale,
        // and stays at the row's price without a struck-through one if that is no cut at all.
        const { storeId: _storeId, price: _price, ...rest } = input;
        await this.update(existing, {
          ...rest,
          ...(onSale ? {} : { price: input.price }),
          available: true,
        });
        if (onSale) {
          try {
            await this.startSale(existing, input.price);
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error;
            await this.update(existing, { price: input.price });
          }
        }
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
    await this.announceIfBack(product, { ...product, available });
  }

  /**
   * «Снова в наличии»: a good that could not be bought and now can is news to whoever saved it
   * (the favorites handler tells them, once a day at most). Only the turn from «no» to «yes» —
   * an edit of a good that was on the counter all along says nothing.
   */
  private async announceIfBack(before: Buyable, after: Buyable & ProductWithImages): Promise<void> {
    if (buyable(before) || !buyable(after)) return;
    if (!(await this.stores.isPublic(after.storeId))) return;
    await this.publish(
      createEvent(PRODUCT_EVENT.BACK_IN_STOCK, {
        productId: after.id,
        storeId: after.storeId,
        name: after.name as Record<string, string>,
        price: after.price,
        currency: after.currency,
        imageUrl: after.images[0]?.url ?? null,
      }),
    );
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
