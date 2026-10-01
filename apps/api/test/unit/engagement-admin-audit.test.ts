/**
 * The admin and audit modules are staff-only top to bottom: settings and branding need
 * settings:write, the operator wall order:read_any, the trail audit:read — at the route and again
 * in the service — and the trail is read-only and tenant-scoped. What leaked: the redaction of
 * secrets in the trail only looked at the top level of a body, and the branding logo accepted any
 * URL scheme although the value is served to every storefront unauthenticated.
 *
 * Real routes, services, repositories and roles; Prisma, the cache and the controllers are fakes.
 */
import { effectivePermissions, type AuthenticatedUser } from '@bazar/auth';
import { ROLE, type Role } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import type { RequestContext } from '../../src/common/types/request-context.js';
import { adminRoutes } from '../../src/modules/admin/routes/admin.routes.js';
import { updateBrandingSchema } from '../../src/modules/admin/schemas/index.js';
import { AdminService } from '../../src/modules/admin/service/admin.service.js';
import { auditRoutes } from '../../src/modules/audit/routes/audit.routes.js';
import { AuditRepository } from '../../src/modules/audit/repository/audit.repository.js';
import { AuditService } from '../../src/modules/audit/service/audit.service.js';

const TENANT = 't1';

const user = (name: string, roles: Role[]): AuthenticatedUser => ({
  id: `user-${name}`,
  tenantId: TENANT,
  roles,
  permissions: effectivePermissions(roles),
  sessionId: 's1',
  locale: 'ru',
});

const ctx = (who: AuthenticatedUser | null): RequestContext => ({
  requestId: 'r1',
  tenantId: TENANT,
  locale: 'ru',
  user: who,
  ip: null,
  userAgent: null,
  startedAt: new Date(),
});

const customer = user('customer', [ROLE.CUSTOMER]);
const courier = user('courier', [ROLE.COURIER]);
const vendor = user('vendor', [ROLE.VENDOR]);
const operator = user('operator', [ROLE.OPERATOR]);
const admin = user('admin', [ROLE.ADMIN]);
const superAdmin = user('super', [ROLE.SUPER_ADMIN]);
const WITHOUT_AUDIT = [customer, courier, vendor, operator];
const WITHOUT_SETTINGS = [customer, courier, vendor, operator];

const logger = { error() {}, warn() {}, info() {}, debug() {} };

// ---------------------------------------------------------------- the routes

type Hook = (request: unknown) => Promise<void>;
interface Mounted {
  hooks: Hook[];
  routes: { method: string; path: string; guards: Hook[] }[];
}

/** Mounts a route plugin on a stand-in for Fastify and keeps every guard that stands before a handler. */
async function mount(plugin: (app: FastifyInstance) => Promise<void>): Promise<Mounted> {
  const mounted: Mounted = { hooks: [], routes: [] };
  const route =
    (method: string) =>
    (path: string, ...rest: unknown[]) => {
      const options = (rest.length > 1 ? rest[0] : {}) as { preHandler?: Hook | Hook[] };
      const pre = options.preHandler;
      mounted.routes.push({
        method,
        path,
        guards: pre === undefined ? [] : Array.isArray(pre) ? pre : [pre],
      });
    };
  const app = {
    addHook: (name: string, hook: Hook) => {
      if (name === 'preHandler') mounted.hooks.push(hook);
    },
    get: route('GET'),
    post: route('POST'),
    patch: route('PATCH'),
    put: route('PUT'),
    delete: route('DELETE'),
  };
  await plugin(app as unknown as FastifyInstance);
  return mounted;
}

/** The outcome of sending `who` through every guard of a route, in order. */
async function reach(
  mounted: Mounted,
  method: string,
  path: string,
  who: AuthenticatedUser | null,
  request: object = {},
) {
  const route = mounted.routes.find((r) => r.method === method && r.path === path);
  if (route === undefined) throw new Error(`no ${method} ${path}`);
  const req = { user: who ?? undefined, query: {}, params: {}, body: {}, ...request };
  try {
    for (const guard of [...mounted.hooks, ...route.guards]) await guard(req);
    return 'allowed';
  } catch (error) {
    return (error as { httpStatus?: number }).httpStatus === 401 ? 'unauthenticated' : 'forbidden';
  }
}

describe('the audit routes', () => {
  it('are for audit:read and nobody else, signed-out callers included', async () => {
    const mounted = await mount(auditRoutes({} as never));
    for (const who of WITHOUT_AUDIT) {
      expect(await reach(mounted, 'GET', '/', who)).toBe('forbidden');
    }
    expect(await reach(mounted, 'GET', '/', null)).toBe('unauthenticated');
    expect(await reach(mounted, 'GET', '/', admin)).toBe('allowed');
    expect(await reach(mounted, 'GET', '/', superAdmin)).toBe('allowed');
  });

  it('expose reading only: a trail has no write, edit or delete route', async () => {
    const mounted = await mount(auditRoutes({} as never));
    expect(mounted.routes.map((r) => r.method)).toEqual(['GET', 'GET']);
  });
});

describe('the admin routes', () => {
  const BODY = { branding: { appName: 'Bazar' } };

  it('keep settings and branding to settings:write', async () => {
    const mounted = await mount(adminRoutes({} as never));
    const protectedRoutes: [string, string, object?][] = [
      ['GET', '/tenant'],
      ['GET', '/settings'],
      ['PATCH', '/tenant/branding', { body: BODY }],
      ['PATCH', '/settings', { body: { ordersEnabled: false } }],
    ];
    for (const [method, path, request] of protectedRoutes) {
      for (const who of WITHOUT_SETTINGS) {
        expect(await reach(mounted, method, path, who, request), `${method} ${path}`).toBe(
          'forbidden',
        );
      }
      expect(await reach(mounted, method, path, null, request)).toBe('unauthenticated');
      expect(await reach(mounted, method, path, admin, request)).toBe('allowed');
    }
  });

  it('show the operator wall to the desk and to nobody else', async () => {
    const mounted = await mount(adminRoutes({} as never));
    for (const who of [customer, courier, vendor]) {
      expect(await reach(mounted, 'GET', '/monitoring', who)).toBe('forbidden');
    }
    expect(await reach(mounted, 'GET', '/monitoring', null)).toBe('unauthenticated');
    expect(await reach(mounted, 'GET', '/monitoring', operator)).toBe('allowed');
    expect(await reach(mounted, 'GET', '/monitoring', admin)).toBe('allowed');
  });
});

// ---------------------------------------------------------------- the services

describe('the admin service', () => {
  function service() {
    const calls: [string, ...unknown[]][] = [];
    const repository = {
      async tenant(id: string) {
        calls.push(['tenant', id]);
        return { id };
      },
      async settings(id: string) {
        calls.push(['settings', id]);
        return { tenantId: id };
      },
      async updateSettings(id: string, input: unknown) {
        calls.push(['updateSettings', id, input]);
        return { tenantId: id };
      },
      async updateBranding(id: string) {
        calls.push(['updateBranding', id]);
        return { id };
      },
      async monitoring() {
        calls.push(['monitoring']);
        return {};
      },
    };
    const cache = {
      async get() {
        return null;
      },
      async set() {},
      async del() {},
      async invalidateByTag() {},
    };
    const svc = new AdminService({
      repository,
      cache,
      logger,
      events: { async publish() {} },
    } as never);
    return { svc, calls };
  }

  it('reads and writes settings and branding only with settings:write, for the caller’s own tenant', async () => {
    const { svc, calls } = service();
    for (const who of WITHOUT_SETTINGS) {
      const acts: (() => Promise<unknown>)[] = [
        () => svc.tenant(),
        () => svc.getSettings(),
        () => svc.updateSettings({ ordersEnabled: false }),
        () => svc.updateBranding({ branding: {} }),
      ];
      for (const act of acts) {
        await expect(runWithContext(ctx(who), act)).rejects.toBeInstanceOf(ForbiddenError);
      }
    }
    expect(calls).toEqual([]);

    await runWithContext(ctx(admin), async () => {
      await svc.updateSettings({ ordersEnabled: false });
      await svc.tenant();
    });
    expect(calls).toEqual([
      ['updateSettings', TENANT, { ordersEnabled: false }],
      ['tenant', TENANT],
    ]);
  });

  it('shows the monitoring wall to staff only', async () => {
    const { svc } = service();
    for (const who of [customer, courier, vendor]) {
      await expect(runWithContext(ctx(who), () => svc.monitoring())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    await expect(runWithContext(ctx(operator), () => svc.monitoring())).resolves.toBeDefined();
  });
});

describe('the branding a tenant publishes', () => {
  const branding = (logoUrl: string | null) => ({ branding: { appName: 'Bazar', logoUrl } });

  it('takes an http(s) logo, or none', () => {
    expect(
      updateBrandingSchema.safeParse(branding('https://cdn.example.uz/logo.png')).success,
    ).toBe(true);
    expect(updateBrandingSchema.safeParse(branding('http://cdn.example.uz/logo.png')).success).toBe(
      true,
    );
    expect(updateBrandingSchema.safeParse(branding(null)).success).toBe(true);
    expect(updateBrandingSchema.safeParse({ branding: { appName: 'Bazar' } }).success).toBe(true);
  });

  it('refuses a logo whose scheme runs code or inlines data', () => {
    for (const url of [
      'javascript:alert(document.cookie)',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(updateBrandingSchema.safeParse(branding(url)).success, url).toBe(false);
    }
  });
});

describe('the audit service', () => {
  function service() {
    const written: Record<string, unknown>[] = [];
    const listed: unknown[] = [];
    const repository = {
      async create(entry: Record<string, unknown>) {
        written.push(entry);
      },
      async list(filters: unknown) {
        listed.push(filters);
        return { items: [] };
      },
      async trail(entity: string, id: string) {
        listed.push([entity, id]);
        return [];
      },
    };
    const svc = new AuditService(
      { logger, events: { async publish() {} } } as never,
      repository as never,
    );
    return { svc, written, listed };
  }

  it('lets only audit:read read the trail, the list and one record’s history', async () => {
    const { svc, listed } = service();
    for (const who of WITHOUT_AUDIT) {
      await expect(runWithContext(ctx(who), () => svc.list({}))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(runWithContext(ctx(who), () => svc.trail('order', 'o1'))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    await expect(runWithContext(ctx(null), () => svc.list({}))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(listed).toEqual([]);
    await runWithContext(ctx(admin), async () => {
      await svc.list({});
      await svc.trail('order', 'o1');
    });
    expect(listed).toHaveLength(2);
  });

  it('keeps secrets out of what it stores, at any depth', async () => {
    const { svc, written } = service();
    await svc.record({
      tenantId: TENANT,
      actorId: 'u1',
      action: 'settings.patch',
      entity: 'settings',
      entityId: null,
      before: null,
      after: {
        name: 'Bazar',
        password: 'hunter2',
        credentials: { secretKey: 'sk_live', note: 'kept', inner: { token: 't0k' } },
        providers: [
          { id: 'payme', apiKey: 'k' },
          { id: 'click', secret: 's' },
        ],
        otp: '1234',
        when: new Date('2026-10-01T00:00:00Z'),
      },
    });
    expect(written[0]?.['after']).toEqual({
      name: 'Bazar',
      password: '[redacted]',
      credentials: { secretKey: '[redacted]', note: 'kept', inner: { token: '[redacted]' } },
      providers: [
        { id: 'payme', apiKey: '[redacted]' },
        { id: 'click', secret: '[redacted]' },
      ],
      otp: '[redacted]',
      when: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('does not walk a body without end', async () => {
    const { svc, written } = service();
    let deep: Record<string, unknown> = { password: 'x' };
    for (let level = 0; level < 40; level += 1) deep = { next: deep };
    await svc.record({
      tenantId: TENANT,
      actorId: 'u1',
      action: 'a.b',
      entity: 'a',
      entityId: null,
      before: deep,
      after: null,
    });
    expect(JSON.stringify(written[0]?.['before'])).not.toContain('"x"');
  });

  it('never fails the thing it records', async () => {
    const svc = new AuditService(
      { logger, events: { async publish() {} } } as never,
      {
        async create() {
          throw new Error('insert timed out');
        },
      } as never,
    );
    await expect(
      svc.record({
        tenantId: TENANT,
        actorId: null,
        action: 'a.b',
        entity: 'a',
        entityId: null,
        before: null,
        after: null,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('the audit table', () => {
  function recording() {
    const calls: { op: string; args: Record<string, unknown> }[] = [];
    const prisma = {
      auditLog: {
        async findMany(args: Record<string, unknown>) {
          calls.push({ op: 'findMany', args });
          return [];
        },
        async count(args: Record<string, unknown>) {
          calls.push({ op: 'count', args });
          return 0;
        },
      },
    };
    return { repository: new AuditRepository(prisma as never), calls };
  }

  it('reads the list and a record’s trail inside the tenant, oldest first for the trail', async () => {
    const { repository, calls } = recording();
    await runWithContext(ctx(admin), async () => {
      await repository.list({ actorId: 'u1', entity: 'order' });
      await repository.trail('order', 'o1');
    });
    const list = calls.find((c) => c.op === 'findMany')!;
    expect(list.args['where']).toMatchObject({ tenantId: TENANT, actorId: 'u1', entity: 'order' });
    const trail = calls.filter((c) => c.op === 'findMany')[1]!;
    expect(trail.args).toMatchObject({
      where: { tenantId: TENANT, entity: 'order', entityId: 'o1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('has nothing that edits or deletes a row', () => {
    const { repository } = recording();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(repository));
    expect(methods.filter((name) => /update|delete|remove|upsert/i.test(name))).toEqual([]);
  });
});
