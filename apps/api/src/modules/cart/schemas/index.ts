/**
 * Cart request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { addCartItemSchema, updateCartItemSchema } from '@bazar/validation';

import { idSchema } from '@bazar/validation';
import { z } from 'zod';

export const storeParamsSchema = z.object({ storeId: idSchema });

export const cartItemParamsSchema = z.object({ storeId: idSchema, itemId: idSchema });
