/** Endpoint functions for /haggle — asking for a discount and answering. */
import type { AnswerHaggleDto, CreateHaggleDto, HaggleDto } from '@bazar/types';

import type { Http } from '../client.js';

export const haggleApi = (http: Http) => ({
  ask: (body: CreateHaggleDto) => http.request<HaggleDto>('POST', '/haggle', { body }),
  mine: () => http.request<HaggleDto[]>('GET', '/haggle/mine'),
  forStore: (storeId: string) =>
    http.request<HaggleDto[]>('GET', '/haggle', { query: { storeId } }),
  answer: (id: string, body: AnswerHaggleDto) =>
    http.request<HaggleDto>('POST', `/haggle/${id}/answer`, { body }),
});
