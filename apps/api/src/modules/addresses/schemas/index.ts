/**
 * Addresses request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createAddressSchema, updateAddressSchema } from '@bazar/validation';

import { idSchema } from '@bazar/validation';
import { z } from 'zod';

export const addressIdParamsSchema = z.object({ id: idSchema });
