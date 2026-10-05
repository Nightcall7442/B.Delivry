/** Endpoint functions for /regulars — «Свой продавец». */
import type { MyStallDto, RegularDto, RegularNoteDto } from '@bazar/types';

import type { Http } from '../client.js';

export const regularsApi = (http: Http) => ({
  /** The stall: the customer of one of its orders, as it knows them. */
  ofOrder: (orderId: string) => http.request<RegularDto>('GET', `/regulars/orders/${orderId}`),
  /** The stall's own note about that customer; an empty one forgets it. */
  setNote: (orderId: string, body: RegularNoteDto) =>
    http.request<RegularDto>('PUT', `/regulars/orders/${orderId}/note`, { body }),
  /** The customer: their standing at a stall. */
  mine: (storeId: string) => http.request<MyStallDto>('GET', `/regulars/stores/${storeId}/me`),
});
