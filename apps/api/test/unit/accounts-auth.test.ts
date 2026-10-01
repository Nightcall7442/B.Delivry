/**
 * Sign-in. The customer, courier and vendor flags (blocked, suspended, unverified, rejected) never
 * reached the token, so a profile the desk had shut kept working until the person signed out; the OTP
 * attempt counter was read before and written after the comparison, so a burst of parallel guesses all
 * saw "no attempts yet" and a right code could be spent twice; a refresh token could be rotated by two
 * requests at once; the password path answered an unknown phone without doing the work a known one
 * costs; and a session trimmed off the end kept a live access token. The real AuthRepository runs here
 * over an in-memory database, so what the queries match is what is tested.
 */
import { decodeJwt } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@bazar/constants';
import { MemorySessionStore } from '../../src/infrastructure/redis/session.store.js';
import { activeProfileIds } from '../../src/modules/auth/guards/profile-access.js';
import { hashOtp, hashPassword, verifyPassword } from '../../src/modules/auth/guards/index.js';
import { AuthRepository } from '../../src/modules/auth/repository/auth.repository.js';
import { AuthService, TokenService } from '../../src/modules/auth/service/auth.service.js';

vi.mock('../../src/modules/auth/guards/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/auth/guards/index.js')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const config = {
  accessSecret: 'a'.repeat(32),
  refreshSecret: 'r'.repeat(32),
  sessionSecret: 's'.repeat(32),
  accessTtlSeconds: 900,
  refreshTtlSeconds: 86_400,
  passwordHashRounds: 12,
  otpTtlSeconds: 300,
  otpLength: 6,
  issuer: 'bazar',
  audience: 'https://api.test',
};

const PHONE = '+998901234567';
const CODE = '123456';
const device = { deviceName: 'test' };

type Row = Record<string, any>;

function userRow(extra: Row = {}): Row {
  return {
    id: 'u1',
    tenantId: 't1',
    phone: PHONE,
    locale: 'uz',
    status: 'ACTIVE',
    passwordHash: null,
    failedLogins: 0,
    lockedUntil: null,
    deletedAt: null,
    roles: [{ role: 'CUSTOMER' }],
    customer: { id: 'cust-1', blockedAt: null },
    courier: null,
    vendor: null,
    ...extra,
  };
}

/** The handful of Prisma calls AuthRepository makes, over arrays, with where-clauses actually matched. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return (condition.in as unknown[]).includes(value);
      if ('gt' in condition) return value > condition.gt;
      if ('gte' in condition) return value >= condition.gte;
      if ('not' in condition) return value !== condition.not;
      return false;
    }
    return value === condition;
  });
}

function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in value) {
      row[key] = (row[key] as number) + (value.increment as number);
    } else row[key] = value;
  }
}

function world(users: Row[] = [userRow()]) {
  const db = { users, sessions: [] as Row[], otps: [] as Row[] };
  let tick = 0;
  const prisma = {
    user: {
      async findFirst({ where }: { where: Row }) {
        const row = db.users.find((candidate) => matches(candidate, where));
        return row === undefined ? null : { ...row };
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const row = db.users.find((candidate) => matches(candidate, where))!;
        apply(row, data);
        return row;
      },
      async create({ data }: { data: Row }) {
        const row = userRow({
          ...data,
          id: `u${db.users.length + 1}`,
          roles: (data.roles?.create ?? []).map((entry: Row) => ({ role: entry.role })),
          customer: { id: `cust-${db.users.length + 1}`, blockedAt: null },
        });
        db.users.push(row);
        return row;
      },
    },
    userPermission: {
      async findMany() {
        return [];
      },
    },
    session: {
      async create({ data }: { data: Row }) {
        tick += 1;
        const row = {
          id: `s${tick}`,
          version: 0,
          revokedAt: null,
          lastSeenAt: new Date(1_700_000_000_000 + tick),
          createdAt: new Date(),
          ...data,
        };
        db.sessions.push(row);
        return row;
      },
      async findUnique({ where }: { where: Row }) {
        // A snapshot, like a real read: a row handed out by reference would change under the caller.
        const row = db.sessions.find((candidate) => candidate.id === where.id);
        return row === undefined ? null : { ...row };
      },
      async findMany({ where, skip = 0 }: { where: Row; skip?: number }) {
        return db.sessions
          .filter((row) => matches(row, where))
          .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
          .slice(skip);
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const row = db.sessions.find((candidate) => candidate.id === where.id)!;
        apply(row, data);
        return row;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const hit = db.sessions.filter((row) => matches(row, where));
        for (const row of hit) apply(row, data);
        return { count: hit.length };
      },
    },
    otpCode: {
      async findFirst({ where }: { where: Row }) {
        const row = db.otps.find((candidate) => matches(candidate, where));
        return row === undefined ? null : { ...row };
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const row = db.otps.find((candidate) => candidate.id === where.id)!;
        apply(row, data);
        return row;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const hit = db.otps.filter((row) => matches(row, where));
        for (const row of hit) apply(row, data);
        return { count: hit.length };
      },
    },
    pushToken: { async upsert() {} },
  };

  const repository = new AuthRepository(prisma as never);
  const store = new MemorySessionStore();
  const tokens = new TokenService(config, repository, store);
  const auth = new AuthService({
    config,
    repository,
    tokens,
    sessions: store,
    notifications: {},
    telegramBot: { setLoginHandler() {} },
    telegramUsers: {},
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as never);

  const issueOtp = async (code = CODE) => {
    db.otps.push({
      id: `otp${db.otps.length + 1}`,
      tenantId: 't1',
      phone: PHONE,
      codeHash: await hashOtp(code, config.sessionSecret),
      purpose: 'LOGIN',
      attempts: 0,
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
      createdAt: new Date(),
    });
  };

  return { db, repository, store, tokens, auth, issueOtp };
}

const errorCode = async (promise: Promise<unknown>): Promise<string | undefined> =>
  promise.then(
    () => undefined,
    (error: { code?: string }) => error.code,
  );

describe('which profile ids may ride on a token', () => {
  const customer = { id: 'cust-1', blockedAt: null as Date | null };
  const courier = { id: 'c1', status: 'OFFLINE', verifiedAt: new Date() as Date | null };
  const vendor = { id: 'v1', status: 'ACTIVE' };

  it('leaves a shut profile off and keeps a live one', () => {
    const ids = (rows: Parameters<typeof activeProfileIds>[0]) => activeProfileIds(rows);
    const none = { customer: null, courier: null, vendor: null };

    expect(ids({ ...none, customer })).toMatchObject({ customerId: 'cust-1' });
    expect(
      ids({ ...none, customer: { ...customer, blockedAt: new Date() } }).customerId,
    ).toBeNull();

    for (const status of ['OFFLINE', 'ONLINE', 'BUSY']) {
      expect(ids({ ...none, courier: { ...courier, status } }).courierId).toBe('c1');
    }
    expect(ids({ ...none, courier: { ...courier, status: 'SUSPENDED' } }).courierId).toBeNull();
    expect(ids({ ...none, courier: { ...courier, verifiedAt: null } }).courierId).toBeNull();

    // PENDING stays: a new seller opens the cabinet while the desk looks at them.
    for (const status of ['ACTIVE', 'PENDING']) {
      expect(ids({ ...none, vendor: { ...vendor, status } }).vendorId).toBe('v1');
    }
    for (const status of ['SUSPENDED', 'REJECTED']) {
      expect(ids({ ...none, vendor: { ...vendor, status } }).vendorId).toBeNull();
    }
  });
});

describe('the token a sign-in produces', () => {
  const claims = async (user: Row) => {
    const { auth, issueOtp } = world([user]);
    await issueOtp();
    const result = await auth.verifyOtp('t1', PHONE, CODE, device, 'uz');
    return { token: decodeJwt(result.accessToken), principal: result.user };
  };

  it('carries the ids of live profiles', async () => {
    const { token, principal } = await claims(
      userRow({
        roles: [{ role: 'CUSTOMER' }, { role: 'COURIER' }, { role: 'VENDOR' }],
        courier: { id: 'c1', status: 'OFFLINE', verifiedAt: new Date() },
        vendor: { id: 'v1', status: 'PENDING' },
      }),
    );
    expect(token).toMatchObject({ customerId: 'cust-1', courierId: 'c1', vendorId: 'v1' });
    expect(principal).toMatchObject({ customerId: 'cust-1', courierId: 'c1', vendorId: 'v1' });
  });

  it('leaves out a blocked customer, a suspended or unverified courier, a suspended or rejected vendor', async () => {
    const blocked = await claims(userRow({ customer: { id: 'cust-1', blockedAt: new Date() } }));
    expect(blocked.token).not.toHaveProperty('customerId');
    expect(blocked.principal).not.toHaveProperty('customerId');

    for (const courier of [
      { id: 'c1', status: 'SUSPENDED', verifiedAt: new Date() },
      { id: 'c1', status: 'OFFLINE', verifiedAt: null },
    ]) {
      const result = await claims(userRow({ roles: [{ role: 'COURIER' }], courier }));
      expect(result.token).not.toHaveProperty('courierId');
      expect(result.principal).not.toHaveProperty('courierId');
    }

    for (const status of ['SUSPENDED', 'REJECTED']) {
      const result = await claims(
        userRow({ roles: [{ role: 'VENDOR' }], vendor: { id: 'v1', status } }),
      );
      expect(result.token).not.toHaveProperty('vendorId');
      expect(result.principal).not.toHaveProperty('vendorId');
    }
  });

  it('is rebuilt on refresh: a customer blocked after signing in loses the id at the next token', async () => {
    const { auth, db, issueOtp } = world();
    await issueOtp();
    const first = await auth.verifyOtp('t1', PHONE, CODE, device, 'uz');
    expect(decodeJwt(first.accessToken)).toHaveProperty('customerId', 'cust-1');

    db.users[0]!.customer.blockedAt = new Date();
    const second = await auth.refresh(first.refreshToken, device);
    expect(decodeJwt(second.accessToken)).not.toHaveProperty('customerId');
  });

  it('is the same on the password path', async () => {
    const passwordHash = await hashPassword('correct-horse-1');
    const { auth } = world([
      userRow({
        passwordHash,
        roles: [{ role: 'COURIER' }],
        courier: { id: 'c1', status: 'SUSPENDED', verifiedAt: new Date() },
      }),
    ]);
    const result = await auth.login('t1', PHONE, 'correct-horse-1', device);
    expect(decodeJwt(result.accessToken)).not.toHaveProperty('courierId');
  });
});

describe('the login code', () => {
  it('signs in once with the right code', async () => {
    const { auth, issueOtp } = world();
    await issueOtp();
    await expect(auth.verifyOtp('t1', PHONE, CODE, device, 'uz')).resolves.toMatchObject({
      isNewUser: false,
    });
    // Burned: the same code does not work a second time.
    expect(await errorCode(auth.verifyOtp('t1', PHONE, CODE, device, 'uz'))).toBe('OTP_EXPIRED');
  });

  it('counts wrong codes and locks the code at the limit, even for the right one afterwards', async () => {
    const { auth, issueOtp } = world();
    await issueOtp();
    const codes: (string | undefined)[] = [];
    for (let attempt = 1; attempt <= LIMITS.OTP_MAX_ATTEMPTS; attempt += 1) {
      codes.push(await errorCode(auth.verifyOtp('t1', PHONE, '000000', device, 'uz')));
    }
    expect(codes.slice(0, -1)).toEqual(Array(LIMITS.OTP_MAX_ATTEMPTS - 1).fill('INVALID_OTP'));
    expect(codes.at(-1)).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect(await errorCode(auth.verifyOtp('t1', PHONE, CODE, device, 'uz'))).toBe(
      'OTP_ATTEMPTS_EXCEEDED',
    );
  });

  it('compares no more than the allowed number of guesses, however many arrive at once', async () => {
    const { auth, issueOtp } = world();
    await issueOtp();
    // Twenty guesses in flight together, the right one the seventh. Each claims its attempt number
    // first, so the seventh is refused unread; counted after the comparison, all twenty read "no
    // attempts yet" and the seventh got in.
    const guesses = Array.from({ length: 20 }, (_, index) => (index === 6 ? CODE : '000000'));
    const outcomes = await Promise.allSettled(
      guesses.map((code) => auth.verifyOtp('t1', PHONE, code, device, 'uz')),
    );
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(0);
  });

  it('still lets the right code through when it arrives within the allowance, in a burst', async () => {
    const { auth, issueOtp } = world();
    await issueOtp();
    const guesses = ['000000', '000000', CODE, '000000'];
    const outcomes = await Promise.allSettled(
      guesses.map((code) => auth.verifyOtp('t1', PHONE, code, device, 'uz')),
    );
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'rejected',
      'rejected',
      'fulfilled',
      'rejected',
    ]);
  });

  it('works exactly once when the right code is sent twice at the same moment', async () => {
    const { auth, db, issueOtp } = world();
    await issueOtp();
    const outcomes = await Promise.allSettled([
      auth.verifyOtp('t1', PHONE, CODE, device, 'uz'),
      auth.verifyOtp('t1', PHONE, CODE, device, 'uz'),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const lost = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason.code).toBe('OTP_EXPIRED');
    // One session, not two.
    expect(db.sessions).toHaveLength(1);
  });

  it('spends a code conditionally: the second try on the same row gets false', async () => {
    const { repository, issueOtp } = world();
    await issueOtp();
    expect(await repository.consumeOtp('otp1')).toBe(true);
    expect(await repository.consumeOtp('otp1')).toBe(false);
  });
});

describe('refreshing a session', () => {
  it('rotates the token pair and treats the old refresh token as a leak', async () => {
    const w = world();
    await w.issueOtp();
    const first = await w.auth.verifyOtp('t1', PHONE, CODE, device, 'uz');
    const second = await w.auth.refresh(first.refreshToken, device);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(w.db.sessions).toHaveLength(1);
    expect(w.db.sessions[0]).toMatchObject({ version: 1, revokedAt: null });

    // The first token is behind the session now: replay kills the session.
    expect(await errorCode(w.auth.refresh(first.refreshToken, device))).toBe('SESSION_REVOKED');
    expect(w.db.sessions[0]!.revokedAt).not.toBeNull();
    expect(await errorCode(w.auth.refresh(second.refreshToken, device))).toBe('SESSION_REVOKED');
  });

  it('lets exactly one of two simultaneous refreshes through, and ends the session for both', async () => {
    const w = world();
    await w.issueOtp();
    const first = await w.auth.verifyOtp('t1', PHONE, CODE, device, 'uz');

    const outcomes = await Promise.allSettled([
      w.auth.refresh(first.refreshToken, device),
      w.auth.refresh(first.refreshToken, device),
    ]);
    // Rotated unconditionally, both read version 0 and both were handed a pair: one pair would be
    // dead on arrival and the other would belong to whoever got there second.
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const lost = outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason.code).toBe('SESSION_REVOKED');
    expect(w.db.sessions[0]!.revokedAt).not.toBeNull();
    expect(await w.store.isRevoked(w.db.sessions[0]!.id)).toBe(true);
  });

  it('rotates only the version the caller read', async () => {
    const w = world();
    await w.issueOtp();
    await w.auth.verifyOtp('t1', PHONE, CODE, device, 'uz');
    const sessionId = w.db.sessions[0]!.id;
    const expiry = new Date(Date.now() + 1000);

    expect(await w.repository.rotateSession(sessionId, 0, 'hash-1', expiry)).toBe(1);
    expect(await w.repository.rotateSession(sessionId, 0, 'hash-2', expiry)).toBeNull();
    expect(w.db.sessions[0]).toMatchObject({ version: 1, refreshTokenHash: 'hash-1' });
  });

  it('refuses a refresh token whose session belongs to someone else', async () => {
    const w = world([userRow(), userRow({ id: 'u2', phone: '+998907654321' })]);
    await w.issueOtp();
    const first = await w.auth.verifyOtp('t1', PHONE, CODE, device, 'uz');
    w.db.sessions[0]!.userId = 'u2';
    expect(await errorCode(w.auth.refresh(first.refreshToken, device))).toBe('SESSION_REVOKED');
  });

  it('kills the access token of a session trimmed off the end of the device list', async () => {
    const w = world();
    const user = (await w.repository.findByPhone('t1', PHONE))!;
    for (let i = 0; i < LIMITS.MAX_SESSIONS_PER_USER + 1; i += 1) {
      await w.tokens.issue(user, device);
    }
    const dead = w.db.sessions.filter((row) => row.revokedAt !== null);
    expect(dead).toHaveLength(1);
    // Revoked in the database AND in the store the middleware asks on every request.
    expect(await w.store.isRevoked(dead[0]!.id)).toBe(true);
  });
});

describe('signing in with a password', () => {
  it('does the same work for a phone that does not exist as for one that does', async () => {
    const calls = vi.mocked(verifyPassword);
    calls.mockClear();
    const w = world([userRow({ passwordHash: null })]);

    // An unknown phone, and a known phone with no password: both still derive a hash.
    expect(await errorCode(w.auth.login('t1', '+998909999999', 'whatever-123', device))).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(calls).toHaveBeenCalledTimes(1);
    expect(await errorCode(w.auth.login('t1', PHONE, 'whatever-123', device))).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('still signs in the right password and counts the wrong one', async () => {
    const passwordHash = await hashPassword('correct-horse-1');
    const w = world([userRow({ passwordHash })]);
    expect(await errorCode(w.auth.login('t1', PHONE, 'wrong-horse-123', device))).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(w.db.users[0]!.failedLogins).toBe(1);
    await expect(w.auth.login('t1', PHONE, 'correct-horse-1', device)).resolves.toHaveProperty(
      'accessToken',
    );
    expect(w.db.users[0]!.failedLogins).toBe(0);
  });
});
