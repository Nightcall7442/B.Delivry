/**
 * «Без кости»: a customer's wish for one line of the basket — «кусок, не фарш», «покрупнее» —
 * carried to the stall as the order item's comment (the vendor's gather slip and the courier's
 * weighing sheet show it). Kept beside the quantities, not in them: the stored basket and a
 * shared basket link stay what they were.
 */
import type { CartQuantities } from './cart.js';

/** Product id → the wish for that line. */
export type CartNotes = Record<string, string>;

/** The order item's comment holds as much (orderItemInputSchema). */
export const CART_NOTE_MAX = 200;

/** A wish as typed: trimmed and capped; nothing but spaces is no wish. */
export const cleanNote = (text: string): string => text.trim().slice(0, CART_NOTE_MAX);

/** The wishes of what is still in the basket — a line taken out takes its wish with it. */
export function notesFor(notes: CartNotes, quantities: CartQuantities): CartNotes {
  const kept = Object.entries(notes).filter(
    ([id, note]) => (quantities[id] ?? 0) > 0 && cleanNote(note) !== '',
  );
  return kept.length === Object.keys(notes).length ? notes : Object.fromEntries(kept);
}

/** The wishes without those of `productIds` — the same object when none of them had one. */
export function withoutNotes(notes: CartNotes, productIds: readonly string[]): CartNotes {
  if (!productIds.some((id) => id in notes)) return notes;
  const kept = { ...notes };
  for (const id of productIds) delete kept[id];
  return kept;
}

/** Stored wishes, as read back from storage: anything but text is dropped. */
export function readNotes(value: unknown): CartNotes {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([id, note]) =>
      typeof note === 'string' && cleanNote(note) !== '' ? [[id, cleanNote(note)]] : [],
    ),
  );
}

/** One line of an order as the API takes it, the wish riding along when there is one. */
export function orderLine(
  productId: string,
  quantity: number,
  notes: CartNotes,
): { productId: string; quantity: number; comment?: string } {
  const comment = cleanNote(notes[productId] ?? '');
  return { productId, quantity, ...(comment !== '' ? { comment } : {}) };
}
