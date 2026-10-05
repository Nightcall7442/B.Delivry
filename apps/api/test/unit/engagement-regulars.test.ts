/**
 * «Свой продавец»: the stall sees, on an order it holds, how many times this customer came back,
 * what they take and what they asked for, and keeps a note of its own. Only through its own order:
 * another stall, and the customer themselves, get the NotFound a stranger gets. The customer sees
 * their own standing at a stall.
 *
 * Real RegularsService over a small in-memory Prisma; the summaries are tested on their own.
 */
import { effectivePermissions } from '@bazar/auth';
import { ORDER_STATUS } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { usualOf, wishesOf } from '../../src/modules/regulars/domain/regular.js';
import { RegularsService } from '../../src/modules/regulars/service/regulars.service.js';

const logger = { error() {}, warn() {}, info() {}, debug() {} };
const base = systemContext('t1', 'r1', 'ru');
const as = (roles: string[], extra: Record<string, string>) =>
  ({
    ...base,
    system: undefined,
    user: {
      id: 'user-1',
      tenantId: 't1',
      roles,
      permissions: effectivePermissions(roles as never),
      ...extra,
    },
  }) as never;
const stall = (vendorId: string) => as(['VENDOR'], { vendorId });
const customer = (customerId: string) => as(['CUSTOMER'], { customerId });

const line = (productId: string | null, ru: string, comment: string | null = null) => ({
  productId,
  name: { ru },
  comment,
});

describe('the stall’s memory of a customer', () => {
  // Newest first, as the service reads them.
  const orders = [
    { items: [line('lamb', 'Баранина', 'без кости'), line('carrot', 'Морковь')] },
    { items: [line('lamb', 'Баранина', 'Без кости'), line('onion', 'Лук', 'покрупнее')] },
    { items: [line('lamb', 'Баранина'), line('carrot', 'Морковь'), line(null, 'Зира')] },
    { items: [line(null, 'Зира'), line('rice', 'Рис', '  ')] },
  ];

  it('knows what they come back for: goods in two orders or more, the most often first', () => {
    expect(usualOf(orders)).toEqual([
      { name: { ru: 'Баранина' }, orders: 3 },
      { name: { ru: 'Морковь' }, orders: 2 },
      // A deleted good is remembered by its name.
      { name: { ru: 'Зира' }, orders: 2 },
    ]);
  });

  it('remembers what they asked for, latest first, each once', () => {
    expect(wishesOf(orders)).toEqual(['без кости', 'покрупнее']);
  });
});

function world() {
  const notes = new Map<string, string>();
  const ORDERS = [
    // The order on the table, at Farkhod's stall (vendor v1).
    {
      id: 'o-now',
      storeId: 'st1',
      customerId: 'c1',
      vendorId: 'v1',
      status: ORDER_STATUS.CONFIRMED,
      at: 5,
    },
    {
      id: 'o-1',
      storeId: 'st1',
      customerId: 'c1',
      vendorId: 'v1',
      status: ORDER_STATUS.DELIVERED,
      at: 1,
    },
    {
      id: 'o-2',
      storeId: 'st1',
      customerId: 'c1',
      vendorId: 'v1',
      status: ORDER_STATUS.DELIVERED,
      at: 3,
    },
    {
      id: 'o-x',
      storeId: 'st1',
      customerId: 'c1',
      vendorId: 'v1',
      status: ORDER_STATUS.CANCELLED,
      at: 4,
    },
    // The same customer at another stall: not Farkhod's business.
    {
      id: 'o-other',
      storeId: 'st2',
      customerId: 'c1',
      vendorId: 'v2',
      status: ORDER_STATUS.DELIVERED,
      at: 2,
    },
  ];
  type Where = {
    id?: string | { not: string };
    storeId?: string;
    customerId?: string;
    status?: string;
  };
  const matching = (where: Where) =>
    ORDERS.filter(
      (order) =>
        (where.id === undefined ||
          (typeof where.id === 'string' ? order.id === where.id : order.id !== where.id.not)) &&
        (where.storeId === undefined || order.storeId === where.storeId) &&
        (where.customerId === undefined || order.customerId === where.customerId) &&
        (where.status === undefined || order.status === where.status),
    );
  const placed = (at: number) => new Date(Date.UTC(2026, 8, at));
  const prisma = {
    order: {
      async findFirst({
        where,
        orderBy,
      }: {
        where: Where;
        orderBy?: { placedAt: 'asc' | 'desc' };
      }) {
        const rows = matching(where).sort((a, b) =>
          orderBy?.placedAt === 'desc' ? b.at - a.at : a.at - b.at,
        );
        const row = rows[0];
        return row
          ? {
              id: row.id,
              storeId: row.storeId,
              customerId: row.customerId,
              store: { vendorId: row.vendorId },
              placedAt: placed(row.at),
            }
          : null;
      },
      async count({ where }: { where: Where }) {
        return matching(where).length;
      },
      async findMany({ where }: { where: Where }) {
        return matching(where)
          .sort((a, b) => b.at - a.at)
          .map((row) => ({
            items: [{ productId: 'lamb', name: { ru: 'Баранина' }, comment: `заказ ${row.id}` }],
          }));
      },
    },
    storeCustomerNote: {
      async findUnique({
        where,
      }: {
        where: { storeId_customerId: { storeId: string; customerId: string } };
      }) {
        const key = `${where.storeId_customerId.storeId}:${where.storeId_customerId.customerId}`;
        return notes.has(key) ? { note: notes.get(key)! } : null;
      },
      async upsert({
        where,
        update,
      }: {
        where: { storeId_customerId: { storeId: string; customerId: string } };
        update: { note: string };
      }) {
        notes.set(
          `${where.storeId_customerId.storeId}:${where.storeId_customerId.customerId}`,
          update.note,
        );
      },
      async deleteMany({ where }: { where: { storeId: string; customerId: string } }) {
        notes.delete(`${where.storeId}:${where.customerId}`);
      },
    },
  };
  const service = new RegularsService({
    prisma,
    logger,
    events: { async publish() {} },
  } as never);
  return { service, notes };
}

describe('on the stall’s own order', () => {
  it('counts the delivered orders at this stall before this one, and since when', async () => {
    const { service } = world();
    const regular = await runWithContext(stall('v1'), () => service.forOrder('o-now'));
    expect(regular).toMatchObject({
      previousOrders: 2,
      since: new Date(Date.UTC(2026, 8, 1)).toISOString(),
      wishes: ['заказ o-2', 'заказ o-1'],
      note: null,
    });
  });

  it('keeps the stall’s note, and forgets it when emptied', async () => {
    const { service, notes } = world();
    const saved = await runWithContext(stall('v1'), () =>
      service.setNote('o-now', '  кость отдельно  '),
    );
    expect(saved.note).toBe('кость отдельно');
    expect(notes.get('st1:c1')).toBe('кость отдельно');
    const forgotten = await runWithContext(stall('v1'), () => service.setNote('o-now', ' '));
    expect(forgotten.note).toBeNull();
  });

  it('is nobody else’s: another stall, and the customer, get NotFound', async () => {
    const { service } = world();
    await expect(runWithContext(stall('v2'), () => service.forOrder('o-now'))).rejects.toThrow(
      /not found/i,
    );
    await expect(
      runWithContext(customer('c1'), () => service.setNote('o-now', 'я хороший')),
    ).rejects.toThrow(/not found/i);
  });
});

describe('the customer at a stall', () => {
  it('sees their own delivered orders there and the latest one', async () => {
    const { service } = world();
    await expect(runWithContext(customer('c1'), () => service.mine('st1'))).resolves.toEqual({
      orders: 2,
      since: new Date(Date.UTC(2026, 8, 1)).toISOString(),
      lastOrderId: 'o-2',
    });
  });
});
