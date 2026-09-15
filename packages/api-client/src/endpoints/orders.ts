/** Endpoint functions for /orders. */
import type {
  CancelOrderDto,
  ChatMessageDto,
  CreateGroupOrderDto,
  CreateOrderDto,
  OrderDto,
  OrderListQuery,
  OrderQuoteDto,
  QuoteGroupOrderDto,
  QuoteOrderDto,
} from '@bazar/types';

import type { Http } from '../client.js';
import type { PageQuery } from './page.js';

export const ordersApi = (http: Http) => ({
  /** Delivery fee and total for what is in the cart, before anything is committed. */
  quote: (body: QuoteOrderDto) => http.request<OrderQuoteDto>('POST', '/orders/quote', { body }),
  create: (body: CreateOrderDto) => http.request<OrderDto>('POST', '/orders', { body }),
  /** Cross-bazaar: one trip from several stalls; one order per stall comes back. */
  createGroup: (body: CreateGroupOrderDto) =>
    http.request<OrderDto[]>('POST', '/orders/group', { body }),
  quoteGroup: (body: QuoteGroupOrderDto) =>
    http.request<OrderQuoteDto[]>('POST', '/orders/group/quote', { body }),
  /** Operator: the B2B bank transfer arrived. */
  invoicePaid: (id: string) => http.request<OrderDto>('POST', `/orders/${id}/invoice-paid`),
  list: (query: OrderListQuery & PageQuery = {}) =>
    http.paginated<OrderDto>('/orders', { ...query }),
  get: (id: string) => http.request<OrderDto>('GET', `/orders/${id}`),
  byNumber: (number: string) =>
    http.request<OrderDto>('GET', `/orders/by-number/${encodeURIComponent(number)}`),
  cancel: (id: string, body: CancelOrderDto) =>
    http.request<OrderDto>('POST', `/orders/${id}/cancel`, { body }),
  repeat: (id: string, body: { addressId?: string } = {}) =>
    http.request<OrderDto>('POST', `/orders/${id}/repeat`, { body }),
  /** Courier: what was actually weighed at the stall, with the photo of the scale. */
  actualQuantities: (
    id: string,
    items: { orderItemId: string; actualQuantity: number; photoUrl?: string }[],
  ) => http.request<OrderDto>('POST', `/orders/${id}/actual-quantities`, { body: { items } }),
  /** Operator controls: the vendor's "we have it" and the dispatcher's manual moves. */
  confirm: (id: string) => http.request<OrderDto>('POST', `/orders/${id}/confirm`),
  changeStatus: (id: string, body: { status: OrderDto['status']; comment?: string }) =>
    http.request<OrderDto>('PATCH', `/orders/${id}/status`, { body }),
  /** The order's chat between the customer and the courier. */
  messages: (id: string) => http.request<ChatMessageDto[]>('GET', `/orders/${id}/messages`),
  sendMessage: (id: string, text: string) =>
    http.request<ChatMessageDto>('POST', `/orders/${id}/messages`, { body: { text } }),
});
