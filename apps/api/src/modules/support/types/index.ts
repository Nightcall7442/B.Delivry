/**
 * Support module-internal types & DTOs.
 */
export type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketTopic =
  'ORDER_ISSUE' | 'PAYMENT_ISSUE' | 'COURIER_ISSUE' | 'PRODUCT_QUALITY' | 'ACCOUNT' | 'OTHER';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface CreateTicketInput {
  topic: TicketTopic;
  subject: string;
  body: string;
  orderId?: string | undefined;
  attachmentUrls?: string[] | undefined;
}

export interface TicketListFilters {
  status?: TicketStatus | undefined;
  topic?: TicketTopic | undefined;
  assigneeId?: string | undefined;
  userId?: string | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}
