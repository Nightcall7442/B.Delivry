import { describe, expect, it } from 'vitest';
import {
  CART_NOTE_MAX,
  cleanNote,
  notesFor,
  orderLine,
  readNotes,
  withoutNotes,
} from './cart-notes.js';

describe('a wish for one line of the basket', () => {
  it('is what was typed, trimmed and capped at what the order item holds', () => {
    expect(cleanNote('  без кости  ')).toBe('без кости');
    expect(cleanNote('   ')).toBe('');
    expect(cleanNote('я'.repeat(CART_NOTE_MAX + 50))).toHaveLength(CART_NOTE_MAX);
  });

  it('goes with the line: out of the basket, out of the wishes', () => {
    const notes = { p1: 'без кости', p2: 'покрупнее', p3: '  ' };
    expect(notesFor(notes, { p1: 1, p3: 2 })).toEqual({ p1: 'без кости' });
    // Nothing to drop: the same object, so a state update can tell nothing changed.
    const kept = { p1: 'без кости' };
    expect(notesFor(kept, { p1: 0.5 })).toBe(kept);
  });

  it('leaves with the lines taken out, and only with them', () => {
    const notes = { p1: 'без кости', p2: 'покрупнее' };
    expect(withoutNotes(notes, ['p1', 'p9'])).toEqual({ p2: 'покрупнее' });
    expect(withoutNotes(notes, ['p9'])).toBe(notes);
  });

  it('reads back from storage only as text', () => {
    expect(readNotes({ p1: 'без кости', p2: 3, p3: '' })).toEqual({ p1: 'без кости' });
    expect(readNotes(null)).toEqual({});
    expect(readNotes(['без кости'])).toEqual({});
  });

  it('rides along with the order line when there is one', () => {
    const notes = { p1: ' кусок, не фарш ' };
    expect(orderLine('p1', 1.5, notes)).toEqual({
      productId: 'p1',
      quantity: 1.5,
      comment: 'кусок, не фарш',
    });
    expect(orderLine('p2', 2, notes)).toEqual({ productId: 'p2', quantity: 2 });
  });
});
