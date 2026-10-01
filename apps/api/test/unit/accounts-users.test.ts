/**
 * `user:write` belongs to every ADMIN, and the users endpoints only asked for it: an ADMIN could set a
 * SUPER_ADMIN's password and sign in as them, block or delete them, or demote a peer. What the caller
 * may do to WHOM is now decided from the target's roles, inside the caller's tenant, and nobody may
 * lock themselves out through these endpoints.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { UsersController } from '../../src/modules/users/controller/users.controller.js';
import { UsersRepository } from '../../src/modules/users/repository/users.repository.js';
import { updateProfileSchema } from '../../src/modules/users/schemas/index.js';
import { UsersService } from '../../src/modules/users/service/users.service.js';

const as = (roles: string[], userId: string) =>
  ({
    ...systemContext('t1', 'r1', 'ru'),
    system: undefined,
    user: {
      id: userId,
      tenantId: 't1',
      roles,
      permissions: effectivePermissions(roles as never),
    },
  }) as never;

const asSuper = as(['SUPER_ADMIN'], 'u-super');
const asAdmin = as(['ADMIN'], 'u-admin');
const asOperator = as(['OPERATOR'], 'u-operator');
/** An admin who also holds the operator role, so that dropping ADMIN is a grant they could make. */
const asAdminOperator = as(['ADMIN', 'OPERATOR'], 'u-admin-2');

/** One user of the tenant per case; the others of tenant t2 are invisible to a t1 caller. */
function directory() {
  const people: Record<string, { roles: string[]; status: string; tenantId: string }> = {
    'u-super': { roles: ['SUPER_ADMIN'], status: 'ACTIVE', tenantId: 't1' },
    'u-super-2': { roles: ['SUPER_ADMIN'], status: 'ACTIVE', tenantId: 't1' },
    'u-admin': { roles: ['ADMIN'], status: 'ACTIVE', tenantId: 't1' },
    'u-admin-2': { roles: ['ADMIN', 'OPERATOR'], status: 'ACTIVE', tenantId: 't1' },
    'u-operator': { roles: ['OPERATOR'], status: 'ACTIVE', tenantId: 't1' },
    'u-vendor': { roles: ['VENDOR'], status: 'ACTIVE', tenantId: 't1' },
    'u-courier': { roles: ['COURIER', 'CUSTOMER'], status: 'ACTIVE', tenantId: 't1' },
    'u-customer': { roles: ['CUSTOMER'], status: 'ACTIVE', tenantId: 't1' },
    'u-bare': { roles: [], status: 'ACTIVE', tenantId: 't1' },
    'u-blocked': { roles: ['CUSTOMER'], status: 'BLOCKED', tenantId: 't1' },
    'u-pending': { roles: ['CUSTOMER'], status: 'PENDING', tenantId: 't1' },
    'u-foreign-super': { roles: ['SUPER_ADMIN'], status: 'ACTIVE', tenantId: 't2' },
    'u-foreign-customer': { roles: ['CUSTOMER'], status: 'ACTIVE', tenantId: 't2' },
  };
  return people;
}

function service() {
  const people = directory();
  const writes: string[] = [];
  const created: unknown[] = [];
  const logoutAll: string[] = [];
  const svc = new UsersService({
    repository: {
      // Tenant-scoped like the real one: another tenant's user is simply not there.
      async findById(id: string) {
        const row = people[id];
        if (row === undefined || row.tenantId !== 't1') return null;
        return { id, ...row, roles: row.roles.map((role) => ({ role })) };
      },
      async setPassword(id: string) {
        writes.push(`password ${id}`);
      },
      async setStatus(id: string, status: string) {
        writes.push(`status ${id} ${status}`);
      },
      async softDelete(id: string) {
        writes.push(`delete ${id}`);
      },
      async replaceRoles(id: string, roles: string[], grantedBy: string) {
        writes.push(`roles ${id} ${roles.join(',')} by ${grantedBy}`);
      },
      async existsByPhone() {
        return false;
      },
      async createStaff(input: unknown, passwordHash: string | null, grantedBy: string) {
        created.push({ input, passwordHash, grantedBy });
        return { id: 'u-new' };
      },
    },
    auth: {
      async logoutAll(userId: string) {
        logoutAll.push(userId);
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);
  return { svc, writes, created, logoutAll };
}

type Action = (svc: UsersService, id: string) => Promise<unknown>;
const ACTIONS: Record<string, Action> = {
  'set the password': (svc, id) => svc.setPassword(id, 'a-new-password-1'),
  block: (svc, id) => svc.block(id),
  unblock: (svc, id) => svc.unblock(id),
  remove: (svc, id) => svc.remove(id),
  // ADMIN is the one role an ADMIN holds, so this grant gets past assertCanGrant and reaches the rank check.
  'set the roles': (svc, id) => svc.setRoles(id, ['ADMIN']),
};

describe('an ADMIN acting on an account above or beside them', () => {
  for (const [name, act] of Object.entries(ACTIONS)) {
    it(`cannot ${name} of a SUPER_ADMIN`, async () => {
      const { svc, writes, logoutAll } = service();
      await expect(runWithContext(asAdmin, () => act(svc, 'u-super'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(writes).toEqual([]);
      expect(logoutAll).toEqual([]);
    });

    it(`cannot ${name} of a peer ADMIN (even one who is also an operator)`, async () => {
      for (const peer of ['u-admin-2']) {
        const { svc, writes, logoutAll } = service();
        await expect(runWithContext(asAdmin, () => act(svc, peer))).rejects.toBeInstanceOf(
          ForbiddenError,
        );
        expect(writes).toEqual([]);
        expect(logoutAll).toEqual([]);
      }
    });
  }

  it('may still manage operators, vendors, couriers, customers and role-less accounts', async () => {
    for (const target of ['u-operator', 'u-vendor', 'u-courier', 'u-customer', 'u-bare']) {
      const { svc, writes, logoutAll } = service();
      // (This admin also holds OPERATOR, so the role grant below is one they may make.)
      await runWithContext(asAdminOperator, () => svc.setPassword(target, 'a-new-password-1'));
      await runWithContext(asAdminOperator, () => svc.block(target));
      await runWithContext(asAdminOperator, () => svc.setRoles(target, ['OPERATOR']));
      await runWithContext(asAdminOperator, () => svc.remove(target));
      expect(writes).toEqual([
        `password ${target}`,
        `status ${target} BLOCKED`,
        `roles ${target} OPERATOR by u-admin-2`,
        `delete ${target}`,
      ]);
      // Each of those ended the account's sessions.
      expect(logoutAll).toEqual([target, target, target, target]);
    }
  });
});

describe('an ADMIN replacing the roles of an account they may manage', () => {
  // Rank decides WHOM an ADMIN may touch; what they may GIVE is bounded by what they hold themselves:
  // `user:write` plus a manageable target must not be a way to mint a SUPER_ADMIN (or any role
  // the ADMIN does not hold) on a customer, an operator or one's own account.
  const MANAGEABLE = ['u-operator', 'u-vendor', 'u-courier', 'u-customer', 'u-bare'];

  it('cannot grant SUPER_ADMIN to any of them', async () => {
    for (const target of MANAGEABLE) {
      const { svc, writes, logoutAll } = service();
      const error = await runWithContext(asAdmin, () =>
        svc.setRoles(target, ['SUPER_ADMIN']),
      ).catch((thrown: unknown) => thrown);
      expect(error, target).toBeInstanceOf(ForbiddenError);
      // Refused by the grant rule, not by some other check on the way.
      expect(error).toMatchObject({ message: expect.stringContaining('SUPER_ADMIN') });
      expect(writes).toEqual([]);
      expect(logoutAll).toEqual([]);
    }
  });

  it('cannot grant a role they do not hold, SUPER_ADMIN or not', async () => {
    // asAdmin holds ADMIN alone: VENDOR, COURIER, OPERATOR, CUSTOMER are all beyond them.
    for (const target of MANAGEABLE) {
      for (const roles of [
        ['VENDOR'],
        ['COURIER'],
        ['OPERATOR'],
        ['CUSTOMER'],
        ['CUSTOMER', 'VENDOR'],
      ]) {
        const { svc, writes, logoutAll } = service();
        await expect(
          runWithContext(asAdmin, () => svc.setRoles(target, roles as never)),
          `${target} <- ${roles.join(',')}`,
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(writes).toEqual([]);
        expect(logoutAll).toEqual([]);
      }
    }
  });

  it('one role beyond them spoils the whole set, even beside roles they do hold', async () => {
    const { svc, writes, logoutAll } = service();
    // asAdminOperator may grant OPERATOR (and ADMIN), not the SUPER_ADMIN tacked on, nor a COURIER.
    for (const roles of [
      ['OPERATOR', 'SUPER_ADMIN'],
      ['ADMIN', 'OPERATOR', 'SUPER_ADMIN'],
      ['OPERATOR', 'COURIER'],
    ]) {
      await expect(
        runWithContext(asAdminOperator, () => svc.setRoles('u-customer', roles as never)),
        roles.join(','),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(writes).toEqual([]);
    expect(logoutAll).toEqual([]);
  });

  it('cannot promote themselves: keeping ADMIN and adding SUPER_ADMIN is no loss, so only the grant rule stops it', async () => {
    const { svc, writes, logoutAll } = service();
    await expect(
      runWithContext(asAdmin, () => svc.setRoles('u-admin', ['ADMIN', 'SUPER_ADMIN'])),
    ).rejects.toMatchObject({ message: expect.stringContaining('SUPER_ADMIN') });
    expect(writes).toEqual([]);
    expect(logoutAll).toEqual([]);
  });

  it('a SUPER_ADMIN may grant any role, SUPER_ADMIN included, and the account is signed out', async () => {
    for (const roles of [['SUPER_ADMIN'], ['VENDOR'], ['COURIER', 'CUSTOMER']]) {
      const { svc, writes, logoutAll } = service();
      await runWithContext(asSuper, () => svc.setRoles('u-customer', roles as never));
      expect(writes).toEqual([`roles u-customer ${roles.join(',')} by u-super`]);
      expect(logoutAll).toEqual(['u-customer']);
    }
  });
});

describe('a SUPER_ADMIN', () => {
  it('may act on admins and on another SUPER_ADMIN', async () => {
    for (const target of ['u-admin', 'u-admin-2', 'u-super-2']) {
      const { svc, writes } = service();
      await runWithContext(asSuper, () => svc.setPassword(target, 'a-new-password-1'));
      await runWithContext(asSuper, () => svc.block(target));
      await runWithContext(asSuper, () => svc.unblock(target));
      await runWithContext(asSuper, () => svc.setRoles(target, ['OPERATOR']));
      expect(writes).toContain(`status ${target} BLOCKED`);
      expect(writes).toContain(`roles ${target} OPERATOR by u-super`);
    }
  });
});

describe('acting on oneself', () => {
  it('nobody may block or delete their own account, a SUPER_ADMIN included', async () => {
    for (const [who, id] of [
      [asSuper, 'u-super'],
      [asAdmin, 'u-admin'],
    ] as const) {
      const { svc, writes, logoutAll } = service();
      await expect(runWithContext(who, () => svc.block(id))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(runWithContext(who, () => svc.remove(id))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(writes).toEqual([]);
      expect(logoutAll).toEqual([]);
    }
  });

  it('nobody may strip their own roles, but sending the same set back is no change', async () => {
    for (const [who, id, roles] of [
      [asSuper, 'u-super', ['CUSTOMER']],
      [asAdminOperator, 'u-admin-2', ['OPERATOR']],
    ] as const) {
      const { svc, writes, logoutAll } = service();
      await expect(runWithContext(who, () => svc.setRoles(id, [...roles]))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(writes).toEqual([]);
      expect(logoutAll).toEqual([]);
    }

    const { svc, writes } = service();
    await runWithContext(asAdminOperator, () => svc.setRoles('u-admin-2', ['ADMIN', 'OPERATOR']));
    expect(writes).toEqual(['roles u-admin-2 ADMIN,OPERATOR by u-admin-2']);
  });

  it('an ADMIN still changes their own password (no outranking oneself)', async () => {
    const { svc, writes } = service();
    await runWithContext(asAdmin, () => svc.setPassword('u-admin', 'a-new-password-1'));
    expect(writes).toEqual(['password u-admin']);
  });
});

describe('the tenant boundary', () => {
  it('another tenant’s user is a 404 for everything, a SUPER_ADMIN’s target included', async () => {
    for (const [name, act] of Object.entries(ACTIONS)) {
      for (const target of ['u-foreign-customer', 'u-foreign-super']) {
        const { svc, writes, logoutAll } = service();
        await expect(
          runWithContext(asSuper, () => act(svc, target)),
          `${name} ${target}`,
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(writes).toEqual([]);
        expect(logoutAll).toEqual([]);
      }
    }
  });
});

describe('who may use the endpoints at all', () => {
  it('an operator (no user:write) is refused before anything is read', async () => {
    for (const [, act] of Object.entries(ACTIONS)) {
      const { svc, writes } = service();
      await expect(runWithContext(asOperator, () => act(svc, 'u-customer'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      expect(writes).toEqual([]);
    }
  });
});

describe('lifting a block', () => {
  it('only a BLOCKED account is switched on: unblocking must not activate a PENDING one', async () => {
    const blocked = service();
    await runWithContext(asAdmin, () => blocked.svc.unblock('u-blocked'));
    expect(blocked.writes).toEqual(['status u-blocked ACTIVE']);

    for (const target of ['u-pending', 'u-customer']) {
      const other = service();
      await runWithContext(asAdmin, () => other.svc.unblock(target));
      expect(other.writes).toEqual([]);
    }
  });
});

describe('granting roles when creating an account', () => {
  it('an ADMIN cannot create a SUPER_ADMIN; duplicates in the role list are folded and the granter is recorded', async () => {
    const refused = service();
    await expect(
      runWithContext(asAdmin, () =>
        refused.svc.createStaff({
          phone: '+998901112233',
          roles: ['SUPER_ADMIN'],
          password: 'a-password-123',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(refused.created).toEqual([]);

    const { svc, created } = service();
    await runWithContext(asAdminOperator, () =>
      svc.createStaff({
        phone: '+998901112233',
        roles: ['OPERATOR', 'OPERATOR'],
        password: 'a-password-123',
      }),
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      input: { roles: ['OPERATOR'] },
      grantedBy: 'u-admin-2',
    });
  });

  it('folds duplicates when replacing roles, instead of tripping the unique index', async () => {
    const { svc, writes } = service();
    await runWithContext(asSuper, () => svc.setRoles('u-vendor', ['VENDOR', 'VENDOR', 'COURIER']));
    expect(writes).toEqual(['roles u-vendor VENDOR,COURIER by u-super']);
  });
});

describe('the profile a person edits about themselves', () => {
  it('the repository writes only names, email, language and avatar, whatever else is passed in', async () => {
    const seen: { data: Record<string, unknown> }[] = [];
    const prisma = {
      user: {
        async update(args: { data: Record<string, unknown> }) {
          seen.push(args);
          return {};
        },
      },
    };
    const repository = new UsersRepository(prisma as never);
    await repository.updateProfile('u-customer', {
      firstName: 'Ali',
      phone: '+998900000000',
      status: 'ACTIVE',
      roles: ['SUPER_ADMIN'],
      passwordHash: 'x',
      tenantId: 't2',
      deletedAt: null,
    } as never);
    expect(Object.keys(seen[0]!.data)).toEqual(['firstName']);
  });

  it('the schema drops phone, status and roles, and takes only web links as an avatar', () => {
    const parsed = updateProfileSchema.parse({
      firstName: 'Ali',
      phone: '+998900000000',
      status: 'ACTIVE',
      roles: ['SUPER_ADMIN'],
    });
    expect(parsed).toEqual({ firstName: 'Ali' });

    expect(updateProfileSchema.safeParse({ avatarUrl: 'https://cdn.example/a.png' }).success).toBe(
      true,
    );
    expect(updateProfileSchema.safeParse({ avatarUrl: 'http://10.0.2.2:4000/a.png' }).success).toBe(
      true,
    );
    expect(updateProfileSchema.safeParse({ avatarUrl: null }).success).toBe(true);
    for (const avatarUrl of [
      'javascript:alert(1)',
      'data:text/html;base64,PGgxPg==',
      'file:///etc/passwd',
    ]) {
      expect(updateProfileSchema.safeParse({ avatarUrl }).success, avatarUrl).toBe(false);
    }
  });
});

describe('what the desk is shown after creating or re-roling an account', () => {
  const now = new Date('2026-06-01T10:00:00Z');
  // What the repository returns: the whole row, secrets included.
  const rawRow = {
    id: 'u-new',
    tenantId: 't1',
    createdAt: now,
    updatedAt: now,
    phone: '+998901112233',
    email: null,
    firstName: 'Ali',
    lastName: null,
    avatarUrl: null,
    locale: 'ru',
    status: 'ACTIVE',
    phoneVerifiedAt: now,
    lastLoginAt: null,
    passwordHash: 'scrypt$32768$8$1$salt$hash',
    failedLogins: 0,
    telegramChatId: '12345',
    telegramLinkCode: 'one-shot-link-code',
    roles: [{ role: 'OPERATOR' }],
    customer: null,
    courier: null,
    vendor: null,
  };

  it('is the user DTO, without the password hash or the Telegram link code', async () => {
    const controller = new UsersController({
      async createStaff() {
        return rawRow;
      },
      async setRoles() {
        return rawRow;
      },
    } as never);
    const reply = { code() {} } as never;

    const created = await controller.create({ body: {} } as never, reply);
    const changed = await controller.setRoles(
      { params: { id: 'u-new' }, body: { roles: ['OPERATOR'] } } as never,
      reply,
    );

    for (const response of [created, changed]) {
      expect(response.data).toMatchObject({
        id: 'u-new',
        roles: ['OPERATOR'],
        phone: '+998901112233',
      });
      const text = JSON.stringify(response);
      expect(text).not.toContain('scrypt$');
      expect(text).not.toContain('one-shot-link-code');
      expect(text).not.toContain('12345');
    }
  });
});
