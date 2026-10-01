/**
 * The catalog, products and payments repositories write and look up by id. An id that belongs to
 * another tenant must match nothing, so each of these queries names the tenant in its own `where`
 * (a stock decrement and a refund release are money and goods: one forgotten scope and a request in
 * one tenant changes another's). These tests run the real repositories over a Prisma that records
 * every query, so removing the tenant, or the guard next to it, fails here.
 */
import { money } from '@bazar/payments';
import { describe, expect, it } from 'vitest';
import { TenantNotResolvedError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { CatalogRepository } from '../../src/modules/catalog/repository/catalog.repository.js';
import { PaymentsRepository } from '../../src/modules/payments/repository/payments.repository.js';
import { ProductsRepository } from '../../src/modules/products/repository/products.repository.js';

interface Call {
  op: string;
  args: Record<string, unknown>;
}

/**
 * Prisma as far as a repository goes: every `model.method(args)` is recorded under that name and
 * answered from `answers` (an Error is thrown), else with `{ count: 1 }` for a bulk write and null.
 */
function recordingPrisma(answers: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const fallback: Record<string, unknown> = { updateMany: { count: 1 }, deleteMany: { count: 1 } };
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) => {
          if (typeof method !== 'string') return undefined;
          return async (args: Record<string, unknown>) => {
            const op = `${name}.${method}`;
            calls.push({ op, args });
            const answer = op in answers ? answers[op] : (fallback[method] ?? null);
            if (answer instanceof Error) throw answer;
            return answer;
          };
        },
      },
    );
  const prisma = new Proxy(
    {},
    {
      get: (_target, name) =>
        typeof name === 'string' && name !== 'then' ? model(name) : undefined,
    },
  );
  return { prisma, calls };
}

const TENANT = 'tenant-a';
const inTenant = <T>(fn: () => T, tenant = TENANT): T =>
  runWithContext(systemContext(tenant, `req-${tenant}`, 'ru'), fn);

const opsOf = (calls: Call[]) => calls.map((call) => call.op);
const whereOf = (call: Call | undefined) => call?.args['where'];

/** Every `tenantId` named anywhere in a `where`, nested relation filters included. */
function tenantIdsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(tenantIdsIn);
  if (typeof value !== 'object' || value === null || value instanceof Date) return [];
  return Object.entries(value).flatMap(([key, inner]) =>
    key === 'tenantId' && typeof inner === 'string' ? [inner] : tenantIdsIn(inner),
  );
}

interface Probe<R> {
  name: string;
  /** The query whose `where` has to name the tenant. */
  op: string;
  answers?: Record<string, unknown>;
  run: (repo: R) => Promise<unknown>;
}

/**
 * The tenant is read from the request that is running the call, at the moment of the call: the same
 * repository used for two tenants names each one, and with no request there is no query at all.
 */
function tenantFromTheRequest<R>(
  label: string,
  build: (answers: Record<string, unknown>) => { repo: R; calls: Call[] },
  probes: Probe<R>[],
) {
  describe(`${label}: the tenant is the one of the request that is running`, () => {
    for (const probe of probes) {
      it(`${probe.name} names the tenant of each call, and does not run without one`, async () => {
        const { repo, calls } = build(probe.answers ?? {});
        await inTenant(() => probe.run(repo), 'tenant-a');
        await inTenant(() => probe.run(repo), 'tenant-b');
        const guarded = calls.filter((call) => call.op === probe.op);
        expect(guarded.map((call) => tenantIdsIn(whereOf(call)))).toEqual([
          ['tenant-a'],
          ['tenant-b'],
        ]);

        const bare = build(probe.answers ?? {});
        await expect(probe.run(bare.repo)).rejects.toBeInstanceOf(TenantNotResolvedError);
        expect(bare.calls).toEqual([]);
      });
    }
  });
}

// ------------------------------------------------------------------------------------------ catalog

function catalog(answers: Record<string, unknown> = {}) {
  const { prisma, calls } = recordingPrisma(answers);
  return { repo: new CatalogRepository(prisma as never), calls };
}

describe('CatalogRepository.decrementStock', () => {
  it('takes stock only from this tenant’s product, and only while it holds at least that much', async () => {
    const { repo, calls } = catalog();

    await expect(inTenant(() => repo.decrementStock('p1', 3))).resolves.toBe(true);

    expect(opsOf(calls)).toEqual(['product.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'p1', stock: { gte: 3 }, tenantId: TENANT },
      data: { stock: { decrement: 3 } },
    });
  });

  it('is false, and takes nothing, when nothing matched: sold out, or not this tenant’s product', async () => {
    const { repo, calls } = catalog({ 'product.updateMany': { count: 0 } });

    await expect(inTenant(() => repo.decrementStock('p1', 3))).resolves.toBe(false);

    expect(opsOf(calls)).toEqual(['product.updateMany']);
  });
});

tenantFromTheRequest<CatalogRepository>('CatalogRepository', catalog, [
  {
    name: 'decrementStock',
    op: 'product.updateMany',
    run: (repo) => repo.decrementStock('p1', 3),
  },
]);

// ----------------------------------------------------------------------------------------- products

function products(answers: Record<string, unknown> = {}) {
  const { prisma, calls } = recordingPrisma(answers);
  return { repo: new ProductsRepository(prisma as never), calls };
}

describe('ProductsRepository.update', () => {
  const current = { price: 1_000, currency: 'UZS' };

  it('looks the product up in the tenant before it writes, and writes in the tenant too', async () => {
    const { repo, calls } = products({
      'product.findFirstOrThrow': current,
      'product.update': { id: 'p1', images: [] },
    });

    await inTenant(() => repo.update('p1', { available: false }, 'user-1'));

    expect(opsOf(calls)).toEqual(['product.findFirstOrThrow', 'product.update']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'p1', tenantId: TENANT },
      select: { price: true, currency: true },
    });
    expect(whereOf(calls[1])).toEqual({ id: 'p1', tenantId: TENANT });
    expect(calls[1]?.args['data']).toEqual({ available: false });
  });

  it('writes nothing when the lookup finds no such product in the tenant', async () => {
    const notFound = Object.assign(new Error('No Product found'), { code: 'P2025' });
    const { repo, calls } = products({ 'product.findFirstOrThrow': notFound });

    await expect(inTenant(() => repo.update('p9', { available: false }, 'user-1'))).rejects.toBe(
      notFound,
    );

    expect(opsOf(calls)).toEqual(['product.findFirstOrThrow']);
  });

  it('appends a price-history row only when the price moved from the one it read', async () => {
    const changed = products({ 'product.findFirstOrThrow': current });
    await inTenant(() => changed.repo.update('p1', { price: money(1_200, 'UZS') }, 'user-1'));
    expect(changed.calls[1]?.args['data']).toEqual({
      price: 1_200,
      priceHistory: { create: { price: 1_200, currency: 'UZS', changedBy: 'user-1' } },
    });

    const same = products({ 'product.findFirstOrThrow': current });
    await inTenant(() => same.repo.update('p1', { price: money(1_000, 'UZS') }, 'user-1'));
    expect(same.calls[1]?.args['data']).toEqual({ price: 1_000 });
  });
});

describe('ProductsRepository.setAvailability and softDelete', () => {
  it('setAvailability switches this tenant’s product only', async () => {
    const { repo, calls } = products();

    await inTenant(() => repo.setAvailability('p1', false));

    expect(opsOf(calls)).toEqual(['product.update']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'p1', tenantId: TENANT },
      data: { available: false },
    });
  });

  it('softDelete retires this tenant’s product only, and takes it off sale', async () => {
    const { repo, calls } = products();

    await inTenant(() => repo.softDelete('p1'));

    expect(opsOf(calls)).toEqual(['product.update']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'p1', tenantId: TENANT },
      data: { deletedAt: expect.any(Date), available: false },
    });
  });

  it('fail, rather than pass quietly, for an id that is not this tenant’s product', async () => {
    const missing = Object.assign(new Error('Record to update not found'), { code: 'P2025' });
    const { repo } = products({ 'product.update': missing });

    await expect(inTenant(() => repo.setAvailability('p9', true))).rejects.toBe(missing);
    await expect(inTenant(() => repo.softDelete('p9'))).rejects.toBe(missing);
  });
});

describe('ProductsRepository.storeIdOf and priceHistory', () => {
  it('storeIdOf names the store of this tenant’s product', async () => {
    const { repo, calls } = products({ 'product.findFirst': { storeId: 'store-7' } });

    await expect(inTenant(() => repo.storeIdOf('p1'))).resolves.toBe('store-7');

    expect(opsOf(calls)).toEqual(['product.findFirst']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'p1', tenantId: TENANT },
      select: { storeId: true },
    });
  });

  it('storeIdOf has no store to name for an id from another tenant', async () => {
    const { repo } = products();

    await expect(inTenant(() => repo.storeIdOf('p-elsewhere'))).resolves.toBeNull();
  });

  it('priceHistory lists the prices of this tenant’s product only', async () => {
    const { repo, calls } = products();

    await inTenant(() => repo.priceHistory('p1'));

    expect(opsOf(calls)).toEqual(['productPrice.findMany']);
    expect(whereOf(calls[0])).toEqual({ productId: 'p1', product: { tenantId: TENANT } });
  });
});

tenantFromTheRequest<ProductsRepository>('ProductsRepository', products, [
  {
    name: 'update (the lookup)',
    op: 'product.findFirstOrThrow',
    run: (repo) => repo.update('p1', { available: true }, null),
  },
  {
    name: 'update (the write)',
    op: 'product.update',
    run: (repo) => repo.update('p1', { available: true }, null),
  },
  {
    name: 'setAvailability',
    op: 'product.update',
    run: (repo) => repo.setAvailability('p1', true),
  },
  { name: 'softDelete', op: 'product.update', run: (repo) => repo.softDelete('p1') },
  { name: 'storeIdOf', op: 'product.findFirst', run: (repo) => repo.storeIdOf('p1') },
  { name: 'priceHistory', op: 'productPrice.findMany', run: (repo) => repo.priceHistory('p1') },
]);

// ----------------------------------------------------------------------------------------- payments

function payments(answers: Record<string, unknown> = {}) {
  const { prisma, calls } = recordingPrisma(answers);
  return { repo: new PaymentsRepository(prisma as never), calls };
}

describe('PaymentsRepository.findById', () => {
  it('finds a payment of this tenant only', async () => {
    const payment = { id: 'pay-1', tenantId: TENANT };
    const { repo, calls } = payments({ 'payment.findFirst': payment });

    await expect(inTenant(() => repo.findById('pay-1'))).resolves.toBe(payment);

    expect(opsOf(calls)).toEqual(['payment.findFirst']);
    expect(calls[0]?.args).toEqual({ where: { id: 'pay-1', tenantId: TENANT } });
  });

  it('finds nothing for an id from another tenant', async () => {
    const { repo } = payments();

    await expect(inTenant(() => repo.findById('pay-elsewhere'))).resolves.toBeNull();
  });

  it('reads on the transaction it is handed and leaves the pool alone', async () => {
    const pool = payments();
    const tx = recordingPrisma();

    await inTenant(() => pool.repo.findById('pay-1', tx.prisma as never));

    expect(opsOf(tx.calls)).toEqual(['payment.findFirst']);
    expect(whereOf(tx.calls[0])).toEqual({ id: 'pay-1', tenantId: TENANT });
    expect(pool.calls).toEqual([]);
  });
});

describe('PaymentsRepository.releaseRefund', () => {
  it('gives the claimed amount back to this tenant’s payment only', async () => {
    const { repo, calls } = payments();

    await expect(inTenant(() => repo.releaseRefund('pay-1', 300))).resolves.toBeUndefined();

    expect(opsOf(calls)).toEqual(['payment.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'pay-1', tenantId: TENANT },
      data: { refundedAmount: { decrement: 300 } },
    });
  });

  it('gives back nothing, and says nothing, for an id that is not this tenant’s payment', async () => {
    const { repo, calls } = payments({ 'payment.updateMany': { count: 0 } });

    await expect(inTenant(() => repo.releaseRefund('pay-elsewhere', 300))).resolves.toBeUndefined();

    expect(opsOf(calls)).toEqual(['payment.updateMany']);
  });
});

describe('PaymentsRepository: the other writes by id', () => {
  it('reserveRefund claims in one statement that holds the tenant, the status and the amount left', async () => {
    const { repo, calls } = payments();

    await expect(inTenant(() => repo.reserveRefund('pay-1', 300, 1_000))).resolves.toBe(true);

    expect(opsOf(calls)).toEqual(['payment.updateMany']);
    expect(calls[0]?.args).toEqual({
      where: {
        id: 'pay-1',
        tenantId: TENANT,
        status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
        refundedAmount: { lte: 700 },
      },
      data: { refundedAmount: { increment: 300 } },
    });
  });

  it('reserveRefund is false when nothing matched, so no money moves', async () => {
    const { repo } = payments({ 'payment.updateMany': { count: 0 } });

    await expect(inTenant(() => repo.reserveRefund('pay-1', 300, 1_000))).resolves.toBe(false);
  });

  it('updateStatus writes inside the tenant, on the transaction it is handed', async () => {
    const pool = payments();
    const tx = recordingPrisma({ 'payment.update': { id: 'pay-1' } });

    await inTenant(() =>
      pool.repo.updateStatus('pay-1', 'CAPTURED', { externalId: 'x1' }, tx.prisma as never),
    );

    expect(opsOf(tx.calls)).toEqual(['payment.update']);
    expect(tx.calls[0]?.args).toEqual({
      where: { id: 'pay-1', tenantId: TENANT },
      data: { status: 'CAPTURED', externalId: 'x1' },
    });
    expect(pool.calls).toEqual([]);
  });

  it('findByExternalId binds the lookup to the tenant, and to the calling provider when it is named', async () => {
    const named = payments();
    await inTenant(() => named.repo.findByExternalId('ext-1', 'click'));
    expect(whereOf(named.calls[0])).toEqual({
      externalId: 'ext-1',
      provider: 'click',
      tenantId: TENANT,
    });

    const unnamed = payments();
    await inTenant(() => unnamed.repo.findByExternalId('ext-1'));
    expect(whereOf(unnamed.calls[0])).toEqual({ externalId: 'ext-1', tenantId: TENANT });
  });

  it('customerUserId names the user of this tenant’s customer only', async () => {
    const { repo, calls } = payments({ 'customer.findFirst': { userId: 'user-5' } });

    await expect(inTenant(() => repo.customerUserId('cust-1'))).resolves.toBe('user-5');

    expect(opsOf(calls)).toEqual(['customer.findFirst']);
    expect(calls[0]?.args).toEqual({
      where: { id: 'cust-1', tenantId: TENANT },
      select: { userId: true },
    });
  });
});

tenantFromTheRequest<PaymentsRepository>('PaymentsRepository', payments, [
  { name: 'findById', op: 'payment.findFirst', run: (repo) => repo.findById('pay-1') },
  {
    name: 'releaseRefund',
    op: 'payment.updateMany',
    run: (repo) => repo.releaseRefund('pay-1', 300),
  },
  {
    name: 'reserveRefund',
    op: 'payment.updateMany',
    run: (repo) => repo.reserveRefund('pay-1', 300, 1_000),
  },
  {
    name: 'updateStatus',
    op: 'payment.update',
    run: (repo) => repo.updateStatus('pay-1', 'CAPTURED'),
  },
  {
    name: 'findByExternalId',
    op: 'payment.findFirst',
    run: (repo) => repo.findByExternalId('ext-1', 'click'),
  },
  {
    name: 'customerUserId',
    op: 'customer.findFirst',
    run: (repo) => repo.customerUserId('cust-1'),
  },
]);
