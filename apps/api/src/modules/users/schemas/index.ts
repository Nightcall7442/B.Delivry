/**
 * Users request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createUserSchema, updateUserSchema } from '@bazar/validation';

import { ROLE } from '@bazar/constants';
import {
  idSchema,
  listQuerySchema,
  updateProfileSchema as baseProfileSchema,
  userListQuerySchema,
} from '@bazar/validation';
import { z } from 'zod';

/**
 * The profile a person edits about themselves: names, email, language, avatar. Phone, status and roles
 * are not in it (zod drops what it does not know). The avatar is a link other people's screens load,
 * so it must be a web address: `.url()` alone also accepts javascript: and data:.
 */
export const updateProfileSchema = baseProfileSchema.extend({
  avatarUrl: z
    .string()
    .url()
    .max(500)
    .regex(/^https?:\/\//i, 'Must be an http(s) link')
    .nullable()
    .optional(),
});

export const usersListQuerySchema = listQuerySchema.merge(userListQuerySchema);

export const userIdParamsSchema = z.object({ id: idSchema });

export const setRolesSchema = z.object({
  roles: z.array(z.nativeEnum(ROLE)).min(1),
});

export const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

export type UsersListQuery = z.infer<typeof usersListQuerySchema>;
