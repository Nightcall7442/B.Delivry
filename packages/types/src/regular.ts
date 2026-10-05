/**
 * «Свой продавец»: a stall remembers the people who come back — how many times, what they take,
 * what they asked for on their lines — and keeps a note of its own («кость отдельно»).
 */
import type { Id, IsoDateTime, Translated } from './common.js';

/** The stall's view of the customer of one order. The note is the stall's, never the customer's. */
export interface RegularDto {
  /** Delivered orders of this customer at this stall before this one. */
  previousOrders: number;
  /** The first of them. */
  since: IsoDateTime | null;
  /** Goods taken in two orders or more, the most often first. */
  usual: { name: Translated; orders: number }[];
  /** What they wrote on their lines here, latest first: «без кости», «покрупнее». */
  wishes: string[];
  note: string | null;
}

/** The customer's view of a stall they buy from. */
export interface MyStallDto {
  /** Delivered orders here. */
  orders: number;
  since: IsoDateTime | null;
  /** The latest of them: «как в прошлый раз». */
  lastOrderId: Id | null;
}

export interface RegularNoteDto {
  /** Empty forgets the note. */
  note: string;
}
