import { describe, expect, it } from 'vitest';
import { repeatNotes, repeatQuantities } from './order.js';

describe('«как в прошлый раз»', () => {
  const items = [
    { productId: 'lamb', quantity: 1.5, comment: ' без кости ' },
    { productId: 'carrot', quantity: 2, comment: null },
    { productId: null, quantity: 1, comment: 'покрупнее' },
    { productId: 'onion', quantity: 1, comment: '  ' },
  ];

  it('puts the ordered quantities back, over the same goods only', () => {
    expect(repeatQuantities(items, { lamb: 0.5, rice: 1 })).toEqual({
      lamb: 1.5,
      carrot: 2,
      onion: 1,
      rice: 1,
    });
  });

  it('puts the wishes back beside their lines', () => {
    expect(repeatNotes(items)).toEqual({ lamb: 'без кости' });
  });
});
