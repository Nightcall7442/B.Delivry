/**
 * «Покажите товар»: a customer asks the stall for a photograph of this very good, now — the cut of
 * the melon, the fat on the lamb — and the seller shoots it from the counter.
 */
import type { Id, IsoDateTime, TenantEntity, Translated } from './common.js';

/** Waiting for the stall, answered with a photo, or run out unanswered. */
export type LookStatus = 'WAITING' | 'ANSWERED' | 'LAPSED';

export interface ProductLookDto extends TenantEntity {
  storeId: Id;
  productId: Id;
  productName: Translated;
  status: LookStatus;
  photoUrl: string | null;
  answeredAt: IsoDateTime | null;
  /** Until when the ask waits for the stall. */
  expiresAt: IsoDateTime;
}

/** A photo the stall took of the good on request, shown on its page while it is fresh. */
export interface LivePhotoDto {
  url: string;
  takenAt: IsoDateTime;
}

export interface AnswerLookDto {
  photoUrl: string;
}
