/**
 * Users request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createUserSchema, updateProfileSchema, updateUserSchema } from '@bazar/validation';

import { ROLE } from '@bazar/constants';
import { idSchema, listQuerySchema, userListQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const usersListQuerySchema = listQuerySchema.merge(userListQuerySchema);

export const userIdParamsSchema = z.object({ id: idSchema });

export const setRolesSchema = z.object({
  roles: z.array(z.nativeEnum(ROLE)).min(1),
});

export const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export type UsersListQuery = z.infer<typeof usersListQuerySchema>;
