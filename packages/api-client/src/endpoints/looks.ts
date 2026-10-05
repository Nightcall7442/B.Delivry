/** Endpoint functions for /looks — «Покажите товар»: asking a stall for a live photo, answering. */
import type { AnswerLookDto, LivePhotoDto, ProductLookDto } from '@bazar/types';

import type { Http } from '../client.js';

export const looksApi = (http: Http) => ({
  ask: (productId: string) =>
    http.request<ProductLookDto>('POST', '/looks', { body: { productId } }),
  /** The customer's asks of the last day; of one good when `productId` is given. */
  mine: (productId?: string) =>
    http.request<ProductLookDto[]>('GET', '/looks/mine', {
      query: productId === undefined ? {} : { productId },
    }),
  forStore: (storeId: string) =>
    http.request<ProductLookDto[]>('GET', '/looks', { query: { storeId } }),
  answer: (id: string, body: AnswerLookDto) =>
    http.request<ProductLookDto>('POST', `/looks/${id}/answer`, { body }),
  /** The good's fresh photos from the stall, newest first. Public. */
  ofProduct: (productId: string) =>
    http.request<LivePhotoDto[]>('GET', `/looks/product/${productId}`),
});
