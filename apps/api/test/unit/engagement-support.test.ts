/**
 * A ticket belongs to its author and to the support desk, and nobody else sees it. What was not
 * checked: the order a ticket claims to be about (any order id of any tenant was stored, putting
 * that order in front of the desk), the agent a ticket is handed to (any user id was connected as
 * assignee), and the race of two agents taking the same ticket. Writes by bare id did not carry
 * the tenant.
 *
 * Real SupportService and SupportRepository, real roles and can(); Prisma is a fake.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import { SupportRepository } from '../../src/modules/support/repository/support.repository.js';
import { SupportService } from '../../src/modules/support/service/support.service.js';

const TENANT = 't1';

const ctx = (user: AuthenticatedUser | null): RequestContext => ({
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});

const as = (
  name: string,
  roles: Role[],
  ids: { customerId?: string; vendorId?: string; courierId?: string } = {},
) =>
  ctx({
    id: `user-${name}`,
    tenantId: TENANT,
    roles,
    permissions: effectivePermissions(roles),
    sessionId: 's1',
    locale: 'ru',
    ...ids,
  });

const asCustomer = as('cust-1', [ROLE.CUSTOMER], { customerId: 'cust-1' });
const asOtherCustomer = as('cust-2', [ROLE.CUSTOMER], { customerId: 'cust-2' });
const asStallVendor = as('vendor-1', [ROLE.VENDOR], { vendorId: 'vendor-1' });
const asOtherVendor = as('vendor-2', [ROLE.VENDOR], { vendorId: 'vendor-2' });
const asCourier = as('courier-1', [ROLE.COURIER], { courierId: 'courier-1' });
const asOtherCourier = as('courier-2', [ROLE.COURIER], { courierId: 'courier-2' });
const asOperator = as('operator', [ROLE.OPERATOR]);
const asAdmin = as('admin', [ROLE.ADMIN]);

type Ticket = {
  id: string;
  tenantId: string;
  number: string;
  userId: string;
  orderId: string | null;
  status: string;
  assigneeId: string | null;
  messages: unknown[];
};

function world() {
  const tickets: Ticket[] = [];
  const sent: unknown[] = [];
  const staff = new Set(['user-operator', 'user-admin']);
  const orders = new Map([
    [
      'o1',
      { tenantId: TENANT, customerId: 'cust-1', courierId: 'courier-1', vendorId: 'vendor-1' },
    ],
    [
      'o-unassigned',
      { tenantId: TENANT, customerId: 'cust-1', courierId: null, vendorId: 'vendor-1' },
    ],
  ]);

  const repository = {
    async create(input: { orderId?: string }, userId: string, number: string) {
      const made = {
        id: `t-${tickets.length + 1}`,
        tenantId: TENANT,
        number,
        userId,
        orderId: input.orderId ?? null,
        status: 'OPEN',
        assigneeId: null,
        messages: [],
      };
      tickets.push(made);
      return made;
    },
    async findOrderParties(id: string) {
      return orders.get(id) ?? null;
    },
    async isStaffMember(userId: string) {
      return staff.has(userId);
    },
    async findById(id: string) {
      return tickets.find((t) => t.id === id) ?? null;
    },
    async list(filters: Record<string, unknown>) {
      return { items: [], pagination: { filters } };
    },
    async addMessage(ticketId: string, authorId: string) {
      return { id: `m-${ticketId}`, ticketId, authorId };
    },
    async update(id: string, data: Record<string, unknown>) {
      return { id, ...data };
    },
    async setStatus(id: string, status: string) {
      const found = tickets.find((t) => t.id === id)!;
      found.status = status;
      return found;
    },
    // One statement: whoever finds the ticket free (or already theirs) takes it.
    async claim(id: string, userId: string) {
      const found = tickets.find((t) => t.id === id)!;
      if (found.assigneeId !== null && found.assigneeId !== userId) return false;
      found.assigneeId = userId;
      found.status = 'PENDING';
      return true;
    },
    async countOpen() {
      return 0;
    },
  };
  const svc = new SupportService({
    repository,
    notifications: {
      async send(request: unknown) {
        sent.push(request);
      },
      async sendDirect() {},
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, tickets, sent };
}

const TICKET = {
  topic: 'ORDER_ISSUE',
  subject: 'Not fresh',
  body: 'The tomatoes were bad',
} as const;

describe('opening a ticket about an order', () => {
  it.each([
    ['the order’s customer', asCustomer],
    ['its courier', asCourier],
    ['the stall’s vendor', asStallVendor],
    ['an operator', asOperator],
    ['an admin', asAdmin],
  ] as [string, RequestContext][])('is allowed to %s', async (_, who) => {
    const w = world();
    await runWithContext(who, () => w.svc.create({ ...TICKET, orderId: 'o1' }));
    expect(w.tickets[0]?.orderId).toBe('o1');
  });

  it.each([
    ['another customer', asOtherCustomer],
    ['another stall’s vendor', asOtherVendor],
    ['another courier', asOtherCourier],
  ] as [string, RequestContext][])('is refused to %s, and nothing is stored', async (_, who) => {
    const w = world();
    await expect(
      runWithContext(who, () => w.svc.create({ ...TICKET, orderId: 'o1' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(w.tickets).toEqual([]);
  });

  it('cannot point at an order that is nobody’s here: another tenant’s, or none', async () => {
    const w = world();
    await expect(
      runWithContext(asCustomer, () => w.svc.create({ ...TICKET, orderId: 'o-elsewhere' })),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(w.tickets).toEqual([]);
  });

  it('needs no order at all for a question about something else', async () => {
    const w = world();
    await runWithContext(asOtherCustomer, () => w.svc.create({ ...TICKET, topic: 'ACCOUNT' }));
    expect(w.tickets).toHaveLength(1);
  });

  it('works for an order with no courier yet', async () => {
    const w = world();
    await runWithContext(asCustomer, () => w.svc.create({ ...TICKET, orderId: 'o-unassigned' }));
    await expect(
      runWithContext(asCourier, () => w.svc.create({ ...TICKET, orderId: 'o-unassigned' })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('reading and answering a ticket', () => {
  it('is the author’s and the desk’s alone', async () => {
    const w = world();
    const ticket = await runWithContext(asCustomer, () => w.svc.create(TICKET));
    for (const who of [asCustomer, asOperator, asAdmin]) {
      await expect(runWithContext(who, () => w.svc.get(ticket.id))).resolves.toMatchObject({
        id: ticket.id,
      });
    }
    for (const who of [asOtherCustomer, asStallVendor, asCourier]) {
      await expect(runWithContext(who, () => w.svc.get(ticket.id))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        runWithContext(who, () => w.svc.reply(ticket.id, 'hello')),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('shows a customer only their own tickets, whatever user they ask for', async () => {
    const w = world();
    const listed = (await runWithContext(asCustomer, () =>
      w.svc.list({ userId: 'user-cust-2' }),
    )) as unknown as { pagination: { filters: Record<string, unknown> } };
    expect(listed.pagination.filters).toMatchObject({ userId: 'user-cust-1' });
    const desk = (await runWithContext(asOperator, () =>
      w.svc.list({ userId: 'user-cust-2' }),
    )) as unknown as { pagination: { filters: Record<string, unknown> } };
    expect(desk.pagination.filters).toMatchObject({ userId: 'user-cust-2' });
  });

  it('lets the author close their own ticket and nothing else about its state', async () => {
    const w = world();
    const ticket = await runWithContext(asCustomer, () => w.svc.create(TICKET));
    await expect(
      runWithContext(asCustomer, () => w.svc.setStatus(ticket.id, 'RESOLVED')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(asOtherCustomer, () => w.svc.setStatus(ticket.id, 'CLOSED')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await runWithContext(asCustomer, () => w.svc.setStatus(ticket.id, 'CLOSED'));
    expect(w.tickets[0]?.status).toBe('CLOSED');
    await expect(
      runWithContext(asCustomer, () => w.svc.reply(ticket.id, 'one more thing')),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('handing a ticket to someone', () => {
  it('is for a member of the desk, and for none else', async () => {
    const w = world();
    const ticket = await runWithContext(asCustomer, () => w.svc.create(TICKET));
    // A customer's user id, a vendor's, a made-up one: none is an agent.
    for (const assignee of ['user-cust-2', 'user-vendor-1', 'user-from-another-tenant']) {
      await expect(
        runWithContext(asOperator, () => w.svc.assign(ticket.id, assignee)),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(
      runWithContext(asOperator, () => w.svc.assign(ticket.id, 'user-admin')),
    ).resolves.toBeDefined();
    await expect(
      runWithContext(asOperator, () => w.svc.assign(ticket.id, null)),
    ).resolves.toBeDefined();
  });

  it('is the desk’s to do: customers, vendors and couriers cannot assign, claim or prioritise', async () => {
    const w = world();
    const ticket = await runWithContext(asCustomer, () => w.svc.create(TICKET));
    for (const who of [asCustomer, asStallVendor, asCourier]) {
      await expect(
        runWithContext(who, () => w.svc.assign(ticket.id, 'user-admin')),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(runWithContext(who, () => w.svc.claim(ticket.id))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        runWithContext(who, () => w.svc.setPriority(ticket.id, 'URGENT')),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('goes to one agent when two take it at the same moment', async () => {
    const w = world();
    const ticket = await runWithContext(asCustomer, () => w.svc.create(TICKET));
    const results = await Promise.allSettled([
      runWithContext(asOperator, () => w.svc.claim(ticket.id)),
      runWithContext(asAdmin, () => w.svc.claim(ticket.id)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ConflictError);
    expect(['user-operator', 'user-admin']).toContain(w.tickets[0]?.assigneeId);
  });

  it('can be taken again by the agent who already has it', async () => {
    const w = world();
    const ticket = await runWithContext(asCustomer, () => w.svc.create(TICKET));
    await runWithContext(asOperator, () => w.svc.claim(ticket.id));
    await expect(runWithContext(asOperator, () => w.svc.claim(ticket.id))).resolves.toBeDefined();
  });
});

describe('the support tables', () => {
  function recording(opts: { claimed?: number; staff?: number } = {}) {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const record = (op: string, result: unknown) => async (args: Record<string, unknown>) => {
      calls.push({ op, args });
      return result;
    };
    const prisma = {
      order: {
        findFirst: record('order.findFirst', {
          tenantId: TENANT,
          customerId: 'c1',
          courierId: null,
          store: { vendorId: 'v1' },
        }),
      },
      user: { count: record('user.count', opts.staff ?? 1) },
      supportTicket: {
        update: record('ticket.update', {}),
        updateMany: record('ticket.updateMany', { count: opts.claimed ?? 1 }),
      },
    };
    return { repository: new SupportRepository(prisma as never), calls };
  }

  it('reads an order for a ticket only inside the tenant', async () => {
    const { repository, calls } = recording();
    await expect(
      runWithContext(asCustomer, () => repository.findOrderParties('o1')),
    ).resolves.toEqual({ tenantId: TENANT, customerId: 'c1', courierId: null, vendorId: 'v1' });
    expect(calls[0]?.args['where']).toEqual({ id: 'o1', tenantId: TENANT });
  });

  it('counts an agent only among the staff-role users of this tenant', async () => {
    const { repository, calls } = recording();
    await runWithContext(asAdmin, () => repository.isStaffMember('u1'));
    expect(calls[0]?.args['where']).toEqual({
      id: 'u1',
      tenantId: TENANT,
      deletedAt: null,
      roles: { some: { role: { in: ['OPERATOR', 'ADMIN', 'SUPER_ADMIN'] } } },
    });
  });

  it('claims a ticket in one statement, free or already the agent’s', async () => {
    const { repository, calls } = recording();
    await expect(runWithContext(asOperator, () => repository.claim('t1', 'u1'))).resolves.toBe(
      true,
    );
    expect(calls[0]?.args['where']).toEqual({
      id: 't1',
      tenantId: TENANT,
      OR: [{ assigneeId: null }, { assigneeId: 'u1' }],
    });
    const lost = recording({ claimed: 0 });
    await expect(runWithContext(asOperator, () => lost.repository.claim('t1', 'u1'))).resolves.toBe(
      false,
    );
  });

  it('writes to a ticket only inside the tenant', async () => {
    const { repository, calls } = recording();
    await runWithContext(asOperator, async () => {
      await repository.update('t1', { priority: 'HIGH' });
      await repository.setStatus('t1', 'RESOLVED');
    });
    expect(calls.map((c) => c.args['where'])).toEqual([
      { id: 't1', tenantId: TENANT },
      { id: 't1', tenantId: TENANT },
    ]);
  });
});
