/**
 * Categories persistence (Prisma). Reference data, shared across tenants.
 */
import type { Category, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { CreateCategoryInput, UpdateCategoryInput } from '../types/index.js';

export class CategoriesRepository extends BaseRepository {
  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { slug } });
  }

  async listAll(includeInactive = false): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
    });
  }

  async listChildren(parentId: string | null): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { parentId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
  }

  /**
   * Whole subtree in one query, using the materialized path. Walking children
   * recursively would be one round trip per level.
   */
  async subtree(category: Category): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { active: true, path: { startsWith: category.path } },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async create(
    input: CreateCategoryInput,
    slug: string,
    path: string,
    depth: number,
  ): Promise<Category> {
    return this.prisma.category.create({
      data: {
        name: input.name as Prisma.InputJsonValue,
        slug,
        parentId: input.parentId ?? null,
        path,
        depth,
        iconUrl: input.iconUrl ?? null,
        imageUrl: input.imageUrl ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name as Prisma.InputJsonValue } : {}),
        ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  /**
   * The path contains the row's own id, which does not exist until after the
   * insert, so it is written in a second statement right after create.
   */
  async setPath(id: string, path: string): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data: { path } });
  }

  /** Deactivating a branch takes the whole subtree with it. */
  async deactivateSubtree(path: string): Promise<number> {
    const result = await this.prisma.category.updateMany({
      where: { path: { startsWith: path } },
      data: { active: false },
    });
    return result.count;
  }

  async countProducts(categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: { categoryId, available: true, deletedAt: null },
    });
  }
}
