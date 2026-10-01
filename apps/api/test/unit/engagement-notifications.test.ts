/**
 * Notifications are a person's own: they list, count and mark read only theirs, and a device token
 * is theirs once registered. Two lookups did not hold the tenant: a recipient was found by id from
 * any tenant, and a push token named by another tenant's account was simply taken over by the
 * upsert, which moved that account's pushes to whoever sent the token.
 *
 * Real NotificationsService and NotificationsRepository; Prisma and the providers are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE } from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import { NotificationsRepository } from '../../src/modules/notifications/repository/notifications.repository.js';
import { NotificationsService } from '../../src/modules/notifications/service/notifications.service.js';

const ctx = (user: AuthenticatedUser | null, tenantId = 't1'): RequestContext => ({
  requestId: 'r1',
  tenantId,
  locale: 'ru',
  user,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});

const asUser = (id: string, tenantId = 't1') =>
  ctx(
    {
      id,
      tenantId,
      roles: [ROLE.CUSTOMER],
      permissions: effectivePermissions([ROLE.CUSTOMER]),
      sessionId: 's',
      locale: 'ru',
    },
    tenantId,
  );

const logger = { error() {}, warn() {}, info() {}, debug() {} };

describe('a user’s own notifications', () => {
  function service() {
    const calls: [string, ...unknown[]][] = [];
    const repository = {
      async list(userId: string, filters: unknown) {
        calls.push(['list', userId, filters]);
        return { items: [] };
      },
      async countUnread(userId: string) {
        calls.push(['countUnread', userId]);
        return 0;
      },
      async markRead(userId: string, ids: string[]) {
        calls.push(['markRead', userId, ids]);
        return ids.length;
      },
      async markAllRead(userId: string) {
        calls.push(['markAllRead', userId]);
        return 0;
      },
      async getPreferences(userId: string) {
        calls.push(['getPreferences', userId]);
        return {};
      },
      async savePreferences(userId: string, patch: unknown) {
        calls.push(['savePreferences', userId, patch]);
        return {};
      },
      async savePushToken(userId: string, token: string) {
        calls.push(['savePushToken', userId, token]);
      },
    };
    const svc = new NotificationsService({
      repository,
      providers: new Map(),
      logger,
      events: { async publish() {} },
    } as never);
    return { svc, calls };
  }

  it('is read, counted, marked and configured for the caller and nobody they name', async () => {
    const { svc, calls } = service();
    await runWithContext(asUser('alice'), async () => {
      await svc.list({ unreadOnly: true });
      await svc.unreadCount();
      await svc.markRead(['n1', 'n2']);
      await svc.markAllRead();
      await svc.getPreferences();
      await svc.updatePreferences({ marketing: false });
      await svc.registerPushToken('ExponentPushToken[abcdefghij]', 'ios');
    });
    expect(calls.map((call) => call[1])).toEqual(Array(7).fill('alice'));
  });

  it('needs somebody signed in', async () => {
    const { svc, calls } = service();
    await expect(runWithContext(ctx(null), () => svc.list({}))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(runWithContext(ctx(null), () => svc.markRead(['n1']))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(calls).toEqual([]);
  });

  it('looks a recipient up inside the tenant the message belongs to', async () => {
    const lookups: unknown[][] = [];
    const svc = new NotificationsService({
      repository: {
        async findRecipient(...args: unknown[]) {
          lookups.push(args);
          return null;
        },
      },
      providers: new Map(),
      logger,
      events: { async publish() {} },
    } as never);
    await svc.send({
      tenantId: 't1',
      userId: 'someone',
      template: TEMPLATE.ORDER_CREATED,
      params: { orderNumber: 'BZ-1' },
    });
    expect(lookups).toEqual([['someone', 't1']]);
  });
});

describe('the notification tables', () => {
  function recording(held?: { userId: string; tenantId: string }) {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const record = (op: string, result: unknown) => async (args: Record<string, unknown>) => {
      calls.push({ op, args });
      return result;
    };
    const prisma = {
      user: { findFirst: record('user.findFirst', null) },
      pushToken: {
        findUnique: record(
          'pushToken.findUnique',
          held === undefined ? null : { userId: held.userId, user: { tenantId: held.tenantId } },
        ),
        upsert: record('pushToken.upsert', {}),
      },
    };
    return { repository: new NotificationsRepository(prisma as never), calls };
  }

  it('finds a recipient only among the users of the tenant that was asked for', async () => {
    const { repository, calls } = recording();
    await repository.findRecipient('u1', 't1');
    expect(calls[0]?.args['where']).toMatchObject({ deletedAt: null, tenantId: 't1' });
  });

  it('registers a new token, and re-binds one that a device of this tenant handed over', async () => {
    const fresh = recording();
    await runWithContext(asUser('alice'), () =>
      fresh.repository.savePushToken('alice', 'token-token-1', 'ios', 'device-1'),
    );
    expect(fresh.calls.map((c) => c.op)).toEqual(['pushToken.findUnique', 'pushToken.upsert']);

    const handedOver = recording({ userId: 'bob', tenantId: 't1' });
    await runWithContext(asUser('alice'), () =>
      handedOver.repository.savePushToken('alice', 'token-token-1', 'ios'),
    );
    expect(handedOver.calls.map((c) => c.op)).toEqual(['pushToken.findUnique', 'pushToken.upsert']);
    expect(handedOver.calls[1]?.args['update']).toMatchObject({ userId: 'alice' });
  });

  it('does not take a token over from an account of another tenant', async () => {
    const { repository, calls } = recording({ userId: 'victim', tenantId: 't2' });
    await expect(
      runWithContext(asUser('mallory'), () =>
        repository.savePushToken('mallory', 'token-token-1', 'android'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls.map((c) => c.op)).toEqual(['pushToken.findUnique']);
  });
});
