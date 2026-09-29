/**
 * An offer reaches a courier only through the socket, and a socket that was reconnecting when it went
 * out loses it for good (the API had just been redeployed under the courier). `GET /delivery/offers`
 * hands the courier app the same cards from the offers table, so it can ask instead of hoping.
 */
import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { DeliveryRepository } from '../../src/modules/delivery/repository/delivery.repository.js';
import { DeliveryService } from '../../src/modules/delivery/service/delivery.service.js';

const asUser = (user: Record<string, unknown> | null) =>
  ({ ...systemContext('t1', 'r1', 'ru'), system: undefined, user }) as never;
const courier = asUser({ id: 'u1', courierId: 'c1', roles: ['COURIER'] });
const customer = asUser({ id: 'u2', customerId: 'k1', roles: ['CUSTOMER'] });

const delivery = {
  id: 'd1',
  orderId: 'o1',
  courierId: null,
  status: 'SEARCHING',
  pickupAddress: 'Т-1, Ургенч, дехканский базар',
  dropoffAddress: 'Ургенч, ул. Аль-Хорезми, 12',
  distanceMeters: 1800,
  payout: 12_000,
  currency: 'UZS',
};

function service(rows: { expiresAt: Date; delivery: typeof delivery }[]) {
  const asked: { courierId: string; now: Date }[] = [];
  const read: string[] = [];
  const svc = new DeliveryService({
    repository: {
      async pendingOffersFor(courierId: string, now: Date) {
        asked.push({ courierId, now });
        return rows;
      },
    },
    orders: {
      async get(orderId: string) {
        read.push(orderId);
        return {
          number: 'BZ-260929-XNTXBL',
          store: { name: { ru: 'Тандыр-нон, Ургенч', uz: 'Urganch tandir noni' } },
          items: [{}, {}, {}],
        };
      },
      weightOf: () => 2500,
    },
    pricing: {},
    lock: {},
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, asked, read };
}

describe('pendingOffers', () => {
  it('gives the courier the card the socket would have pushed', async () => {
    const expiresAt = new Date(Date.now() + 25_000);
    const { svc, asked, read } = service([{ expiresAt, delivery }]);
    const offers = await runWithContext(courier, () => svc.pendingOffers());

    expect(asked[0]?.courierId).toBe('c1');
    expect(read).toEqual(['o1']);
    expect(offers).toEqual([
      {
        deliveryId: 'd1',
        orderId: 'o1',
        orderNumber: 'BZ-260929-XNTXBL',
        storeName: 'Тандыр-нон, Ургенч',
        pickupAddress: 'Т-1, Ургенч, дехканский базар',
        dropoffAddress: 'Ургенч, ул. Аль-Хорезми, 12',
        distanceMeters: 1800,
        payout: { amount: 12_000, currency: 'UZS' },
        itemCount: 3,
        weightGrams: 2500,
        expiresAt: expiresAt.toISOString(),
      },
    ]);
  });

  it('is empty when nothing is on offer', async () => {
    const { svc, read } = service([]);
    expect(await runWithContext(courier, () => svc.pendingOffers())).toEqual([]);
    expect(read).toEqual([]);
  });

  it('is for couriers only', async () => {
    const { svc } = service([]);
    await expect(runWithContext(customer, () => svc.pendingOffers())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('DeliveryRepository.pendingOffersFor', () => {
  it('asks for this courier’s unexpired, unanswered offers on deliveries nobody has taken', async () => {
    const queries: unknown[] = [];
    const prisma = {
      deliveryOffer: {
        async findMany(args: unknown) {
          queries.push(args);
          return [{ expiresAt: new Date(0), delivery }];
        },
      },
    };
    const repository = new DeliveryRepository(prisma as never);
    const now = new Date('2026-09-29T04:43:40Z');
    const rows = await runWithContext(courier, () => repository.pendingOffersFor('c1', now));

    expect(rows).toEqual([{ expiresAt: new Date(0), delivery }]);
    const { where } = queries[0] as { where: Record<string, unknown> };
    expect(where).toMatchObject({
      courierId: 'c1',
      acceptedAt: null,
      declinedAt: null,
      expiresAt: { gt: now },
      delivery: { tenantId: 't1', courierId: null, status: { in: ['PENDING', 'SEARCHING'] } },
    });
  });
});
