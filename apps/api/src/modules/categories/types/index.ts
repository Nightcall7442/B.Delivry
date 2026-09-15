/**
 * Categories module-internal types & DTOs.
 */
import type { Category } from '@prisma/client';

export interface CreateCategoryInput {
  name: Record<string, string>;
  parentId?: string | null | undefined;
  iconUrl?: string | undefined;
  imageUrl?: string | undefined;
  sortOrder?: number | undefined;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput> & { active?: boolean };

export interface CategoryNode extends Category {
  children: CategoryNode[];
}
