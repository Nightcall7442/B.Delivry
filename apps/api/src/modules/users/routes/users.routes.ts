/**
 * Users route definitions — mounted by src/routes/users.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { UsersController } from '../controller/users.controller.js';
import {
  createUserSchema,
  setPasswordSchema,
  setRolesSchema,
  updateProfileSchema,
  userIdParamsSchema,
  usersListQuerySchema,
} from '../schemas/index.js';

export function usersRoutes(controller: UsersController) {
  return async (app: FastifyInstance): Promise<void> => {
    app.addHook('preHandler', requireAuth);

    // Anyone signed in may read and edit their own profile.
    app.get('/me', controller.me);
    app.patch('/me', { preHandler: validate({ body: updateProfileSchema }) }, controller.updateMe);

    const canRead = requirePermission(PERMISSION.USER_READ);
    const canWrite = requirePermission(PERMISSION.USER_WRITE);

    app.get(
      '/',
      { preHandler: [canRead, validate({ query: usersListQuerySchema })] },
      controller.list,
    );
    app.get(
      '/:id',
      { preHandler: [canRead, validate({ params: userIdParamsSchema })] },
      controller.get,
    );

    app.post(
      '/',
      { preHandler: [canWrite, validate({ body: createUserSchema })] },
      controller.create,
    );
    app.put(
      '/:id/roles',
      { preHandler: [canWrite, validate({ params: userIdParamsSchema, body: setRolesSchema })] },
      controller.setRoles,
    );
    app.put(
      '/:id/password',
      { preHandler: [canWrite, validate({ params: userIdParamsSchema, body: setPasswordSchema })] },
      controller.setPassword,
    );
    app.post(
      '/:id/block',
      { preHandler: [canWrite, validate({ params: userIdParamsSchema })] },
      controller.block,
    );
    app.post(
      '/:id/unblock',
      { preHandler: [canWrite, validate({ params: userIdParamsSchema })] },
      controller.unblock,
    );
    app.delete(
      '/:id',
      { preHandler: [canWrite, validate({ params: userIdParamsSchema })] },
      controller.remove,
    );
  };
}
