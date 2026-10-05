import { createT } from '@bazar/i18n';
import type { ProductLookDto } from '@bazar/types';
import { describe, expect, it } from 'vitest';
import { latestLook, takenAgo } from './looks.js';

const NOW = Date.parse('2026-10-05T10:00:00Z');
const look = (id: string, productId: string, createdAt: string): ProductLookDto => ({
  id,
  tenantId: 't1',
  createdAt,
  updatedAt: createdAt,
  storeId: 's1',
  productId,
  productName: { ru: 'Дыня' },
  status: 'WAITING',
  photoUrl: null,
  answeredAt: null,
  expiresAt: '2026-10-05T12:00:00Z',
});

describe('the customer’s ask for a good', () => {
  it('is the latest one for that good', () => {
    const rows = [
      look('a', 'melon', '2026-10-05T08:00:00Z'),
      look('b', 'melon', '2026-10-05T09:00:00Z'),
      look('c', 'grapes', '2026-10-05T09:30:00Z'),
    ];
    expect(latestLook(rows, 'melon')?.id).toBe('b');
    expect(latestLook(rows, 'lamb')).toBeNull();
  });
});

describe('how long ago the stall took the photo', () => {
  const t = createT('ru');
  it('says it in minutes, then hours', () => {
    expect(takenAgo(t, '2026-10-05T09:59:40Z', NOW)).toBe('снято только что');
    expect(takenAgo(t, '2026-10-05T09:48:00Z', NOW)).toBe('снято 12 мин назад');
    expect(takenAgo(t, '2026-10-05T07:10:00Z', NOW)).toBe('снято 2 ч назад');
  });
});
