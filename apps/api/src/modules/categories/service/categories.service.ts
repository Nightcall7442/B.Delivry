/**
 * Categories business logic. Tree management with materialized paths.
 */
import { PERMISSION } from '@bazar/constants';
import { slugify } from '@bazar/utils';
import type { Category } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ConflictError, NotFoundError } from '../../../common/errors/domain.errors.js';
import { cached, type CacheStore } from '../../../infrastructure/redis/cache.js';
import type { CategoriesRepository } from '../repository/categories.repository.js';
import type { CategoryNode, CreateCategoryInput, UpdateCategoryInput } from '../types/index.js';

const CACHE_TTL_SECONDS = 1800;
const CACHE_TAG = 'categories';

/** Deep trees are a navigation problem, not a data one. */
const MAX_DEPTH = 3;

export interface CategoriesServiceDeps extends ServiceDeps {
  repository: CategoriesRepository;
  cache: CacheStore;
}

export class CategoriesService extends BaseService {
  private readonly repository: CategoriesRepository;
  private readonly cache: CacheStore;

  constructor(deps: CategoriesServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.cache = deps.cache;
  }

  /** The whole tree, built once from a flat list rather than N queries. */
  async tree(storeId?: string): Promise<CategoryNode[]> {
    return cached(
      this.cache,
      `category-tree:${storeId ?? ''}`,
      CACHE_TTL_SECONDS,
      async () => buildTree(await this.repository.listAll(false, storeId)),
      storeId === undefined ? [CACHE_TAG] : [CACHE_TAG, `store:${storeId}`],
    );
  }

  async children(parentId: string | null): Promise<Category[]> {
    return this.repository.listChildren(parentId);
  }

  async get(id: string): Promise<Category> {
    const category = await this.repository.findById(id);
    if (category === null) throw new NotFoundError('Category', id);
    return category;
  }

  /** Ids of a category and everything under it, for a "shop this section" filter. */
  async subtreeIds(id: string): Promise<string[]> {
    const category = await this.get(id);
    const rows = await this.repository.subtree(category);
    return rows.map((row) => row.id);
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    this.authorize(PERMISSION.CATEGORY_WRITE);

    const parent =
      input.parentId === undefined || input.parentId === null
        ? null
        : await this.get(input.parentId);

    if (parent !== null && parent.depth + 1 > MAX_DEPTH) {
      throw new ConflictError(`Categories may not nest deeper than ${MAX_DEPTH} levels`);
    }

    const base = input.name.uz ?? input.name.ru ?? input.name.en ?? 'category';
    const slug = await this.uniqueSlug(slugify(base));

    // Created with a placeholder path, then given its real one: the path is the
    // ancestor chain including this row's own id, so a subtree is one prefix
    // query but the id only exists after the insert.
    const category = await this.repository.create(
      input,
      slug,
      '',
      parent === null ? 0 : parent.depth + 1,
    );

    const path = parent === null ? category.id : `${parent.path}/${category.id}`;
    const withPath = await this.repository.setPath(category.id, path);
    await this.cache.invalidateByTag(CACHE_TAG);

    return withPath;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    this.authorize(PERMISSION.CATEGORY_WRITE);
    await this.get(id);
    const updated = await this.repository.update(id, input);
    await this.cache.invalidateByTag(CACHE_TAG);
    return updated;
  }

  async deactivate(id: string): Promise<number> {
    this.authorize(PERMISSION.CATEGORY_WRITE);
    const category = await this.get(id);
    const count = await this.repository.deactivateSubtree(category.path);
    await this.cache.invalidateByTag(CACHE_TAG);
    return count;
  }

  private async uniqueSlug(base: string): Promise<string> {
    // Slugs are globally unique; a collision gets a short suffix rather than
    // failing the request on a name two sellers both chose.
    if ((await this.repository.findBySlug(base)) === null) return base;
    return `${base}-${Date.now().toString(36).slice(-4)}`;
  }
}

/** Flat rows to a nested tree in one pass, parents before children by depth. */
export function buildTree(rows: readonly Category[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const row of rows) nodes.set(row.id, { ...row, children: [] });

  for (const row of rows) {
    const node = nodes.get(row.id);
    if (node === undefined) continue;
    const parent = row.parentId === null ? undefined : nodes.get(row.parentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }

  return roots;
}
