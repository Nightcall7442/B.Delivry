/**
 * support types / DTOs.
 */
import type { Id, TenantEntity } from './common.js';

export const TICKET_STATUS = {
  OPEN: 'OPEN',
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const TICKET_TOPIC = {
  ORDER_ISSUE: 'ORDER_ISSUE',
  PAYMENT_ISSUE: 'PAYMENT_ISSUE',
  COURIER_ISSUE: 'COURIER_ISSUE',
  PRODUCT_QUALITY: 'PRODUCT_QUALITY',
  ACCOUNT: 'ACCOUNT',
  OTHER: 'OTHER',
} as const;

export type TicketTopic = (typeof TICKET_TOPIC)[keyof typeof TICKET_TOPIC];

export interface SupportMessageDto {
  id: Id;
  ticketId: Id;
  authorId: Id;
  /** True when written by staff: renders on the other side of the thread. */
  fromStaff: boolean;
  body: string;
  attachmentUrls: string[];
  createdAt: string;
}

export interface SupportTicketDto extends TenantEntity {
  number: string;
  userId: Id;
  orderId: Id | null;
  topic: TicketTopic;
  status: TicketStatus;
  subject: string;
  /** Operator currently handling it. */
  assigneeId: Id | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  messages: SupportMessageDto[];
  lastMessageAt: string;
  resolvedAt: string | null;
}

export interface CreateTicketDto {
  topic: TicketTopic;
  subject: string;
  body: string;
  orderId?: Id;
  attachmentUrls?: string[];
}

export interface ReplyTicketDto {
  body: string;
  attachmentUrls?: string[];
}

export interface TicketListQuery {
  status?: TicketStatus;
  topic?: TicketTopic;
  assigneeId?: Id;
  userId?: Id;
  search?: string;
}
