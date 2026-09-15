/**
 * category types / DTOs.
 */
import type { Entity, Id, Translated } from './common.js';

/** A tree: categories nest, `path` holds the materialized ancestor chain. */
export interface CategoryDto extends Entity {
  name: Translated;
  slug: string;
  parentId: Id | null;
  /** Slash-joined ancestor ids, so a whole subtree is one LIKE query. */
  path: string;
  depth: number;
  iconUrl: string | null;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
  productCount?: number;
}

export interface CategoryTreeDto extends CategoryDto {
  children: CategoryTreeDto[];
}

export interface CreateCategoryDto {
  name: Translated;
  parentId?: Id | null;
  iconUrl?: string;
  imageUrl?: string;
  sortOrder?: number;
}

export type UpdateCategoryDto = Partial<CreateCategoryDto> & { active?: boolean };
