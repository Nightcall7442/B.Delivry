/**
 * "Попросить скидку": a customer names a price, the vendor answers.
 */
import type { Id, MoneyDto, TenantEntity, Translated } from './common.js';

export type HaggleStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface HaggleDto extends TenantEntity {
  customerId: Id;
  storeId: Id;
  productId: Id;
  productName: Translated;
  /** The stall's list price at the time of the ask, per unit. */
  listPrice: MoneyDto;
  askedPrice: MoneyDto;
  offeredPrice: MoneyDto | null;
  status: HaggleStatus;
  message: string | null;
  reply: string | null;
  expiresAt: string;
}

export interface CreateHaggleDto {
  productId: Id;
  /** Per unit, minor units. */
  askedPrice: number;
  message?: string;
}

export interface AnswerHaggleDto {
  accept: boolean;
  /** Counter-offer per unit, minor units; omitted = the asked price. */
  price?: number;
  reply?: string;
}
