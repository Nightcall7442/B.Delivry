/**
 * Catalog persistence (Prisma). Tenant-scoped.
 */
import type { Prisma, Product, ProductImage } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CatalogSearchFilters, PurchasableProduct } from '../types/index.js';

const PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' }, take: 10 },
} satisfies Prisma.ProductInclude;

export type ProductWithImages = Product & { images: ProductImage[] };

export class CatalogRepository extends BaseRepository {
  async findById(id: string): Promise<ProductWithImages | null> {
    return this.prisma.product.findFirst({
      where: this.scopedAlive({ id }),
      include: PRODUCT_INCLUDE,
    });
  }

  /**
   * Loads exactly the products an order is about to be built from, in one
   * query, filtered to the store and to what is actually sellable. Anything
   * missing from the result is unavailable, and the caller says which.
   */
  async findPurchasable(storeId: string, ids: string[]): Promise<Map<string, PurchasableProduct>> {
    const rows = await this.prisma.product.findMany({
      where: this.scopedAlive({ storeId, id: { in: ids }, available: true }),
      select: {
        id: true,
        storeId: true,
        slug: true,
        name: true,
        unit: true,
        price: true,
        currency: true,
        minQuantity: true,
        quantityStep: true,
        weightGrams: true,
        stock: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          storeId: row.storeId,
          slug: row.slug,
          name: row.name as Record<string, string>,
          unit: row.unit,
          price: row.price,
          currency: row.currency,
          minQuantity: Number(row.minQuantity),
          quantityStep: Number(row.quantityStep),
          weightGrams: row.weightGrams,
          stock: row.stock === null ? null : Number(row.stock),
        },
      ]),
    );
  }

  async search(filters: CatalogSearchFilters): Promise<PaginatedResult<ProductWithImages>> {
    const where = { ...this.buildWhere(filters), ...(await this.searchIds(filters.search)) };
    return this.page(
      filters,
      (page) =>
        this.prisma.product.findMany({
          where,
          include: PRODUCT_INCLUDE,
          orderBy: [{ available: 'desc' }, { rating: 'desc' }],
          ...page,
        }),
      () => this.prisma.product.count({ where }),
    );
  }

  private buildWhere(filters: CatalogSearchFilters): Prisma.ProductWhereInput {
    return {
      ...this.tenantScope(),
      deletedAt: null,
      ...(filters.availableOnly !== false ? { available: true } : {}),
      ...(filters.storeId !== undefined ? { storeId: filters.storeId } : {}),
      ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
      ...(filters.minPrice !== undefined || filters.maxPrice !== undefined
        ? {
            price: {
              ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
              ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
            },
          }
        : {}),
    };
  }

  /**
   * Text search over the slug and every language of the name. The name is a
   * JSON column, so Prisma cannot ILIKE it: one raw query for the ids, then
   * the usual filters. ICU lower() because a C-collated database leaves
   * Cyrillic upper-case. ponytail: fine for a bazaar's catalogue; pg_trgm or
   * a tsvector column when the catalogue grows past a few thousand rows.
   */
  private async searchIds(search: string | undefined): Promise<Prisma.ProductWhereInput> {
    if (search === undefined || search.trim().length === 0) return {};
    const needle = `%${search.trim().toLowerCase()}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM products
      WHERE "tenantId" = ${this.tenantScope().tenantId}
        AND (slug ILIKE ${needle} OR lower(name::text COLLATE "und-x-icu") LIKE ${needle})
      LIMIT 500`;
    return { id: { in: rows.map((row) => row.id) } };
  }

  /** Decrements tracked stock without letting it go negative. */
  async decrementStock(productId: string, quantity: number): Promise<boolean> {
    const result = await this.prisma.product.updateMany({
      where: { id: productId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    return result.count === 1;
  }

  async listCategories(parentId?: string | null) {
    return this.prisma.category.findMany({
      where: {
        active: true,
        ...(parentId !== undefined ? { parentId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
  }
}
