/**
 * «Покажите товар»: a customer asks a stall for a live photo of a good, the stall answers with one.
 * Asking twice for one good is one ask; three waiting at once is the most; only the stall's own
 * people answer, once; the customer hears with the photo in the push; and the good shows the photo
 * to anyone while it is fresh, never for a stall the public may not see.
 *
 * Real LooksService over an in-memory Prisma.
 */
import { effectivePermissions } from '@bazar/auth';
import { LOOK } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { LooksService } from '../../src/modules/looks/service/looks.service.js';

const logger = { error() {}, warn() {}, info() {}, debug() {} };
const base = systemContext('t1', 'r1', 'ru');
const asCustomer = (customerId: string) =>
  ({
    ...base,
    system: undefined,
    user: {
      id: `user-${customerId}`,
      tenantId: 't1',
      roles: ['CUSTOMER'],
      permissions: effectivePermissions(['CUSTOMER'] as never),
      customerId,
    },
  }) as never;
const asVendor = (vendorId: string) =>
  ({
    ...base,
    system: undefined,
    user: {
      id: `user-${vendorId}`,
      tenantId: 't1',
      roles: ['VENDOR'],
      permissions: effectivePermissions(['VENDOR'] as never),
      vendorId,
    },
  }) as never;

interface Row {
  id: string;
  tenantId: string;
  customerId: string;
  storeId: string;
  productId: string;
  photoUrl: string | null;
  answeredAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Products: the melon at Dilshod's live stall, the grapes at a stall in review. */
const PRODUCTS = [
  { id: 'melon', storeId: 'st1', name: { ru: 'Дыня' }, vendorId: 'v1', live: true },
  { id: 'grapes', storeId: 'st2', name: { ru: 'Виноград' }, vendorId: 'v2', live: false },
  { id: 'lamb', storeId: 'st1', name: { ru: 'Баранина' }, vendorId: 'v1', live: true },
  { id: 'nuts', storeId: 'st1', name: { ru: 'Орехи' }, vendorId: 'v1', live: true },
  { id: 'rice', storeId: 'st1', name: { ru: 'Рис' }, vendorId: 'v1', live: true },
];

const matches = (row: Row, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([key, want]) => {
    const have = (row as unknown as Record<string, unknown>)[key];
    if (want === null) return have === null;
    if (want instanceof Object && 'gt' in (want as object)) {
      return have instanceof Date && have > (want as { gt: Date }).gt;
    }
    return have === want;
  });

function world() {
  const rows: Row[] = [];
  const sent: Record<string, unknown>[] = [];
  let next = 0;
  const withProduct = (row: Row) => ({
    ...row,
    product: { name: PRODUCTS.find((p) => p.id === row.productId)!.name },
  });
  const prisma = {
    product: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        const product = PRODUCTS.find((p) => p.id === where['id']);
        // Both reads ask for a public stall: the purchasable window, or the visible one.
        if (product === undefined || !product.live) return null;
        return { ...product, store: { vendorId: product.vendorId } };
      },
    },
    productLook: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        const row = rows.find((each) => matches(each, where));
        return row ? withProduct(row) : null;
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return rows.filter((each) => matches(each, where)).length;
      },
      async create({
        data,
      }: {
        data: Omit<Row, 'id' | 'createdAt' | 'updatedAt' | 'photoUrl' | 'answeredAt'>;
      }) {
        const now = new Date();
        const row: Row = {
          ...data,
          id: `look-${++next}`,
          photoUrl: null,
          answeredAt: null,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return withProduct(row);
      },
      async updateMany({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: { photoUrl: string; answeredAt: Date };
      }) {
        const hit = rows.filter((each) => matches(each, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      },
      async findMany({ where }: { where: Record<string, unknown> }) {
        return rows
          .filter((each) => matches(each, where))
          .sort((a, b) => (b.answeredAt?.getTime() ?? 0) - (a.answeredAt?.getTime() ?? 0))
          .map(withProduct);
      },
    },
    vendor: {
      async findUnique({ where }: { where: { id: string } }) {
        return { userId: `user-${where.id}` };
      },
    },
    store: {
      async findFirst({ where }: { where: { id: string } }) {
        const product = PRODUCTS.find((p) => p.storeId === where.id);
        return product ? { vendorId: product.vendorId, tenantId: 't1' } : null;
      },
    },
  };
  const service = new LooksService({
    prisma,
    queue: {
      async enqueue(_queue: string, _job: string, payload: Record<string, unknown>) {
        sent.push(payload);
      },
    },
    logger,
    events: { async publish() {} },
  } as never);
  return { service, rows, sent };
}

describe('asking a stall to show a good', () => {
  it('reaches the stall’s owner, and asking again for the same good is the same ask', async () => {
    const { service, rows, sent } = world();
    const first = await runWithContext(asCustomer('c1'), () => service.ask('melon'));
    const again = await runWithContext(asCustomer('c1'), () => service.ask('melon'));
    expect(again.id).toBe(first.id);
    expect(rows).toHaveLength(1);
    expect(first.expiresAt.getTime() - first.createdAt.getTime()).toBeCloseTo(
      LOOK.ASK_TTL_MINUTES * 60_000,
      -3,
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ userId: 'user-v1', deepLink: '/stores/st1' });
  });

  it('keeps at most three waiting for one customer', async () => {
    const { service } = world();
    for (const id of ['melon', 'lamb', 'nuts']) {
      await runWithContext(asCustomer('c1'), () => service.ask(id));
    }
    await expect(runWithContext(asCustomer('c1'), () => service.ask('rice'))).rejects.toThrow(
      /Wait for the stalls/,
    );
    // Another customer is not held back by the first one's asks.
    await expect(
      runWithContext(asCustomer('c2'), () => service.ask('rice')),
    ).resolves.toMatchObject({ productId: 'rice' });
  });

  it('is not possible for a stall the public cannot see', async () => {
    const { service } = world();
    await expect(runWithContext(asCustomer('c1'), () => service.ask('grapes'))).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('the stall’s answer', () => {
  it('is the stall’s own people’s, once, and the customer gets the photo in the push', async () => {
    const { service, sent } = world();
    const look = await runWithContext(asCustomer('c1'), () => service.ask('melon'));

    await expect(
      runWithContext(asVendor('v2'), () => service.answer(look.id, 'https://cdn.example/a.jpg')),
    ).rejects.toThrow();
    const answered = await runWithContext(asVendor('v1'), () =>
      service.answer(look.id, 'https://cdn.example/melon.jpg'),
    );
    expect(answered.photoUrl).toBe('https://cdn.example/melon.jpg');
    expect(sent.at(-1)).toMatchObject({
      userId: 'c1',
      imageUrl: 'https://cdn.example/melon.jpg',
      deepLink: '/product/melon',
    });
    // A second phone at the stall: the first photo stands.
    await expect(
      runWithContext(asVendor('v1'), () => service.answer(look.id, 'https://cdn.example/b.jpg')),
    ).rejects.toThrow(/Already answered/);
  });

  it('shows on the good for anyone while it is fresh', async () => {
    const { service, rows } = world();
    const look = await runWithContext(asCustomer('c1'), () => service.ask('melon'));
    await runWithContext(asVendor('v1'), () =>
      service.answer(look.id, 'https://cdn.example/melon.jpg'),
    );
    const photos = await runWithContext(base, () => service.livePhotos('melon'));
    expect(photos).toEqual([
      { url: 'https://cdn.example/melon.jpg', takenAt: rows[0]!.answeredAt!.toISOString() },
    ]);
    // Taken yesterday morning: no longer «живое».
    rows[0]!.answeredAt = new Date(Date.now() - (LOOK.FRESH_HOURS + 1) * 3_600_000);
    expect(await runWithContext(base, () => service.livePhotos('melon'))).toEqual([]);
    await expect(runWithContext(base, () => service.livePhotos('grapes'))).rejects.toThrow(
      /not found/i,
    );
  });
});
