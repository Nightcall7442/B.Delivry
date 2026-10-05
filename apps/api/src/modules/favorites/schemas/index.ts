/**
 * Favorites request schemas.
 */
import { idSchema } from '@bazar/validation';
import { z } from 'zod';

export const favoriteProductParamsSchema = z.object({ productId: idSchema });
export const favoriteStoreParamsSchema = z.object({ storeId: idSchema });
