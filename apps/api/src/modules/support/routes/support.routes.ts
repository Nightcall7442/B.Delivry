/**
 * Support route definitions — mounted by src/routes/support.routes.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { SupportController } from '../controller/support.controller.js';
import {
  assignTicketSchema,
  createTicketSchema,
  replyTicketSchema,
  setTicketPrioritySchema,
  setTicketStatusSchema,
  ticketIdParamsSchema,
  ticketsListQuerySchema,
} from '../schemas/index.js';

export function supportRoutes(controller: SupportController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Tickets contain addresses and phone numbers, so nothing here is public.
    app.addHook('preHandler', requireAuth);

    app.get('/', { preHandler: validate({ query: ticketsListQuerySchema }) }, controller.list);
    app.post('/', { preHandler: validate({ body: createTicketSchema }) }, controller.create);
    app.get('/:id', { preHandler: validate({ params: ticketIdParamsSchema }) }, controller.get);
    app.post(
      '/:id/messages',
      { preHandler: validate({ params: ticketIdParamsSchema, body: replyTicketSchema }) },
      controller.reply,
    );
    app.put(
      '/:id/status',
      { preHandler: validate({ params: ticketIdParamsSchema, body: setTicketStatusSchema }) },
      controller.setStatus,
    );

    const handles = requirePermission(PERMISSION.SUPPORT_HANDLE);

    app.get('/stats/open', { preHandler: handles }, controller.openCount);
    app.post(
      '/:id/claim',
      { preHandler: [handles, validate({ params: ticketIdParamsSchema })] },
      controller.claim,
    );
    app.put(
      '/:id/assignee',
      {
        preHandler: [handles, validate({ params: ticketIdParamsSchema, body: assignTicketSchema })],
      },
      controller.assign,
    );
    app.put(
      '/:id/priority',
      {
        preHandler: [
          handles,
          validate({ params: ticketIdParamsSchema, body: setTicketPrioritySchema }),
        ],
      },
      controller.setPriority,
    );
  };
}
