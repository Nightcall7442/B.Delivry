/**
 * Products persistence (Prisma). Tenant-scoped.
 */
import type { Prisma, Product, ProductImage } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CreateProductInput, ProductListFilters, UpdateProductInput } from '../types/index.js';

const PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;

export type ProductWithImages = Product & { images: ProductImage[] };

export class ProductsRepository extends BaseRepository {
  async findById(id: string): Promise<ProductWithImages | null> {
    return this.prisma.product.findFirst({
      where: this.scopedAlive({ id }),
      include: PRODUCT_INCLUDE,
    });
  }

  async list(filters: ProductListFilters): Promise<PaginatedResult<ProductWithImages>> {
    const where: Prisma.ProductWhereInput = {
      ...this.tenantScope(),
      deletedAt: null,
      ...(filters.storeId !== undefined ? { storeId: filters.storeId } : {}),
      ...(filters.categoryId !== undefined ? { categoryId: filters.categoryId } : {}),
      ...(filters.availableOnly === true ? { available: true } : {}),
      ...(filters.search !== undefined
        ? { slug: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
    };

    return this.page(
      filters,
      (page) =>
        this.prisma.product.findMany({
          where,
          include: PRODUCT_INCLUDE,
          orderBy: { createdAt: 'desc' },
          ...page,
        }),
      () => this.prisma.product.count({ where }),
    );
  }

  /**
   * Creates the product, its images and the first price-history row together:
   * a price with no history entry is a price nobody can explain later.
   */
  async create(input: CreateProductInput, slug: string): Promise<ProductWithImages> {
    return this.prisma.product.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        storeId: input.storeId,
        categoryId: input.categoryId ?? null,
        name: input.name as Prisma.InputJsonValue,
        // Spread rather than `?? undefined`: Prisma treats an explicitly
        // undefined Json column differently from an absent one.
        ...(input.description !== undefined
          ? { description: input.description as Prisma.InputJsonValue }
          : {}),
        slug,
        unit: input.unit,
        price: input.price.amount,
        oldPrice: input.oldPrice?.amount ?? null,
        currency: input.price.currency,
        minQuantity: input.minQuantity ?? 1,
        quantityStep: input.quantityStep ?? 1,
        weightGrams: input.weightGrams ?? null,
        stock: input.stock ?? null,
        images: {
          create: (input.images ?? []).map((image, index) => ({
            url: image.url,
            width: image.width ?? null,
            height: image.height ?? null,
            alt: image.alt ?? null,
            sortOrder: index,
          })),
        },
        priceHistory: {
          create: { price: input.price.amount, currency: input.price.currency },
        },
      },
      include: PRODUCT_INCLUDE,
    });
  }

  async update(
    id: string,
    input: UpdateProductInput,
    changedBy: string | null,
  ): Promise<ProductWithImages> {
    const current = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { price: true, currency: true },
    });

    const priceChanged = input.price !== undefined && input.price.amount !== current.price;

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name as Prisma.InputJsonValue } : {}),
        ...(input.description !== undefined
          ? { description: input.description as Prisma.InputJsonValue }
          : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.price !== undefined ? { price: input.price.amount } : {}),
        ...(input.oldPrice !== undefined ? { oldPrice: input.oldPrice.amount } : {}),
        ...(input.minQuantity !== undefined ? { minQuantity: input.minQuantity } : {}),
        ...(input.quantityStep !== undefined ? { quantityStep: input.quantityStep } : {}),
        ...(input.weightGrams !== undefined ? { weightGrams: input.weightGrams } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.stock !== undefined ? { stock: input.stock } : {}),
        ...(input.available !== undefined ? { available: input.available } : {}),
        // Appended, never overwritten: this is what settles "it cost less
        // yesterday" arguments.
        ...(priceChanged && input.price !== undefined
          ? {
              priceHistory: {
                create: { price: input.price.amount, currency: input.price.currency, changedBy },
              },
            }
          : {}),
      },
      include: PRODUCT_INCLUDE,
    });
  }

  async replaceImages(
    productId: string,
    images: { url: string; width?: number; height?: number; alt?: string }[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.productImage.deleteMany({ where: { productId } }),
      this.prisma.productImage.createMany({
        data: images.map((image, index) => ({
          productId,
          url: image.url,
          width: image.width ?? null,
          height: image.height ?? null,
          alt: image.alt ?? null,
          sortOrder: index,
        })),
      }),
    ]);
  }

  async setAvailability(id: string, available: boolean): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { available } });
  }

  /** Soft delete: past order items keep pointing at this row. */
  async softDelete(id: string): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), available: false },
    });
  }

  async priceHistory(productId: string) {
    return this.prisma.productPrice.findMany({
      where: { productId },
      orderBy: { validFrom: 'desc' },
      take: 100,
    });
  }

  async storeIdOf(productId: string): Promise<string | null> {
    const row = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { storeId: true },
    });
    return row?.storeId ?? null;
  }
}
