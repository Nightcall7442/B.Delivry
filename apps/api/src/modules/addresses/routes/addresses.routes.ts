/**
 * Addresses route definitions — mounted by src/routes/customers.routes.ts.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requireCustomer } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { AddressesController } from '../controller/addresses.controller.js';
import {
  addressIdParamsSchema,
  createAddressSchema,
  updateAddressSchema,
} from '../schemas/index.js';

export function addressesRoutes(controller: AddressesController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Addresses belong to exactly one customer, so the service reads the owner
    // from the context and no route ever takes a customerId.
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', requireCustomer);

    app.get('/', controller.list);
    app.post('/', { preHandler: validate({ body: createAddressSchema }) }, controller.create);
    app.get('/:id', { preHandler: validate({ params: addressIdParamsSchema }) }, controller.get);
    app.patch(
      '/:id',
      { preHandler: validate({ params: addressIdParamsSchema, body: updateAddressSchema }) },
      controller.update,
    );
    app.post(
      '/:id/default',
      { preHandler: validate({ params: addressIdParamsSchema }) },
      controller.setDefault,
    );
    app.get(
      '/:id/deliverable',
      { preHandler: validate({ params: addressIdParamsSchema }) },
      controller.checkDeliverable,
    );
    app.delete(
      '/:id',
      { preHandler: validate({ params: addressIdParamsSchema }) },
      controller.remove,
    );
  };
}
