/** Endpoint functions for /support — tickets from the customer's side. */
import type { CreateTicketDto, SupportTicketDto } from '@bazar/types';

import type { Http } from '../client.js';

export const supportApi = (http: Http) => ({
  create: (body: CreateTicketDto) => http.request<SupportTicketDto>('POST', '/support', { body }),
});
