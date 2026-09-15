/**
 * Zod schemas: support.
 */
import { LIMITS } from '@bazar/constants';
import { z } from 'zod';
import { idSchema } from './common.schema.js';

export const ticketTopicSchema = z.enum([
  'ORDER_ISSUE',
  'PAYMENT_ISSUE',
  'COURIER_ISSUE',
  'PRODUCT_QUALITY',
  'ACCOUNT',
  'OTHER',
]);

export const ticketStatusSchema = z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']);

export const ticketPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

const attachments = z.array(z.string().url().max(500)).max(5).optional();

export const createTicketSchema = z.object({
  topic: ticketTopicSchema,
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(LIMITS.SUPPORT_MESSAGE_MAX_LENGTH),
  orderId: idSchema.optional(),
  attachmentUrls: attachments,
});

export const replyTicketSchema = z.object({
  body: z.string().trim().min(1).max(LIMITS.SUPPORT_MESSAGE_MAX_LENGTH),
  attachmentUrls: attachments,
});

export const updateTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  assigneeId: idSchema.nullable().optional(),
});

export const ticketListQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  topic: ticketTopicSchema.optional(),
  assigneeId: idSchema.optional(),
  userId: idSchema.optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
