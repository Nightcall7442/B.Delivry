/**
 * The company on an invoice. The desk approves a company, and the credit it grants belongs to that
 * company. `applyBusiness` refused a swap only when the name AND the INN were both new, so a customer
 * could keep the approval (and the credit) and change either one: a different INN under the same name,
 * or another name under the same INN. A change to either is refused as a full change is; the same
 * values again are no change at all.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { CustomersService } from '../../src/modules/customers/service/customers.service.js';

const NAME = 'Кафе Урганч';
const INN = '123456789';

const asCustomer = {
  ...systemContext('t1', 'r1', 'ru'),
  system: undefined,
  user: {
    id: 'user-cust-1',
    tenantId: 't1',
    roles: ['CUSTOMER'],
    permissions: effectivePermissions(['CUSTOMER']),
    customerId: 'cust-1',
  },
} as never;

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'cust-1',
  tenantId: 't1',
  userId: 'user-cust-1',
  blockedAt: null,
  orderCount: 0,
  referredById: null,
  businessApprovedAt: null,
  companyName: null,
  companyInn: null,
  ...extra,
});

const approved = row({
  businessApprovedAt: new Date('2026-04-01'),
  companyName: NAME,
  companyInn: INN,
});

function customers(stored: Record<string, unknown>) {
  const applied: unknown[] = [];
  const svc = new CustomersService({
    repository: {
      async findById() {
        return stored;
      },
      async applyBusiness(id: string, name: string, inn: string) {
        applied.push([id, name, inn]);
        return row({ companyName: name, companyInn: inn });
      },
    },
    auth: { async logoutAll() {} },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  const apply = (name: string, inn: string) =>
    runWithContext(asCustomer, () => svc.applyBusiness(name, inn));
  return { apply, applied };
}

describe('applying again for an approved company', () => {
  it('is refused when only the INN is changed', async () => {
    const { apply, applied } = customers(approved);
    await expect(apply(NAME, '987654321')).rejects.toBeInstanceOf(ConflictError);
    expect(applied).toEqual([]);
  });

  it('is refused when only the name is changed', async () => {
    const { apply, applied } = customers(approved);
    await expect(apply('Кафе «Хива»', INN)).rejects.toBeInstanceOf(ConflictError);
    expect(applied).toEqual([]);
  });

  it('is refused when both are changed', async () => {
    const { apply, applied } = customers(approved);
    await expect(apply('Кафе «Хива»', '987654321')).rejects.toBeInstanceOf(ConflictError);
    expect(applied).toEqual([]);
  });

  it('goes through when nothing is changed', async () => {
    const { apply, applied } = customers(approved);
    await apply(NAME, INN);
    expect(applied).toEqual([['cust-1', NAME, INN]]);
  });
});

describe('applying for a company the desk has not approved', () => {
  it('may still correct the INN alone, or the name alone', async () => {
    const pending = row({ companyName: NAME, companyInn: INN });
    const { apply, applied } = customers(pending);
    await apply(NAME, '987654321');
    await apply('Кафе «Хива»', INN);
    expect(applied).toEqual([
      ['cust-1', NAME, '987654321'],
      ['cust-1', 'Кафе «Хива»', INN],
    ]);
  });

  it('may apply for the first time', async () => {
    const { apply, applied } = customers(row());
    await apply(NAME, INN);
    expect(applied).toEqual([['cust-1', NAME, INN]]);
  });
});
