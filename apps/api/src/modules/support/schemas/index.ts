/**
 * Support request/response Zod schemas (reuse @bazar/validation where shared).
 */
export { createTicketSchema, replyTicketSchema, updateTicketSchema } from '@bazar/validation';

import {
  idSchema,
  listQuerySchema,
  ticketPrioritySchema,
  ticketStatusSchema,
  ticketTopicSchema,
} from '@bazar/validation';
import { z } from 'zod';

export const ticketIdParamsSchema = z.object({ id: idSchema });

export const ticketsListQuerySchema = listQuerySchema.extend({
  status: ticketStatusSchema.optional(),
  topic: ticketTopicSchema.optional(),
  assigneeId: idSchema.optional(),
  userId: idSchema.optional(),
});

export const assignTicketSchema = z.object({ assigneeId: idSchema.nullable() });
export const setTicketStatusSchema = z.object({ status: ticketStatusSchema });
export const setTicketPrioritySchema = z.object({ priority: ticketPrioritySchema });

export type TicketsListQuery = z.infer<typeof ticketsListQuerySchema>;
