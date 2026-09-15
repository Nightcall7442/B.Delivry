/** Endpoint functions for /tracking. */
import type { OrderTrackingDto } from '@bazar/types';

import type { Http } from '../client.js';

export const trackingApi = (http: Http) => ({
  order: (orderId: string) => http.request<OrderTrackingDto>('GET', `/tracking/orders/${orderId}`),
});
