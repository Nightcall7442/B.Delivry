/**
 * Auth persistence (Prisma). Tenant-scoped.
 */
import type { Role } from '@bazar/constants';
import type { OtpPurpose, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import { activeProfileIds } from '../guards/profile-access.js';
import type { CreateUserInput, SessionRecord, UserWithRoles } from '../types/index.js';

/** One query shape for "the principal", used by login and by token refresh. */
const USER_SELECT = {
  id: true,
  tenantId: true,
  phone: true,
  locale: true,
  status: true,
  passwordHash: true,
  failedLogins: true,
  lockedUntil: true,
  roles: { select: { role: true } },
  // The status flags ride along because a profile the desk has shut must not reach the token.
  customer: { select: { id: true, blockedAt: true } },
  courier: { select: { id: true, status: true, verifiedAt: true } },
  vendor: { select: { id: true, status: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export class AuthRepository extends BaseRepository {
  private async toPrincipal(row: UserRow): Promise<UserWithRoles> {
    const extra = await this.prisma.userPermission.findMany({
      where: { userId: row.id },
      select: { permission: true },
    });

    // Every sign-in (code, password, Telegram, refresh) builds its token from this one place, so a
    // blocked customer, a suspended or unverified courier and a suspended or rejected vendor are
    // left without that profile id wherever they come in.
    const { customerId, courierId, vendorId } = activeProfileIds(row);

    return {
      id: row.id,
      tenantId: row.tenantId,
      phone: row.phone,
      locale: row.locale,
      status: row.status,
      passwordHash: row.passwordHash,
      failedLogins: row.failedLogins,
      lockedUntil: row.lockedUntil,
      roles: row.roles.map((entry) => entry.role as Role),
      customerId,
      courierId,
      vendorId,
      extraPermissions: extra.map((entry) => entry.permission),
    };
  }

  /**
   * Takes the tenant explicitly: login happens before a tenant context exists,
   * since the tenant is what the login is being performed against.
   */
  async findByPhone(tenantId: string, phone: string): Promise<UserWithRoles | null> {
    const row = await this.prisma.user.findFirst({
      where: { tenantId, phone, deletedAt: null },
      select: USER_SELECT,
    });
    return row === null ? null : this.toPrincipal(row);
  }

  async findById(userId: string): Promise<UserWithRoles | null> {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT,
    });
    return row === null ? null : this.toPrincipal(row);
  }

  /** New OTP sign-ups start as a CUSTOMER with a verified phone. */
  async createUser(input: CreateUserInput): Promise<UserWithRoles> {
    const row = await this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        phone: input.phone,
        locale: input.locale,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        roles: { create: input.roles.map((role) => ({ role })) },
        customer: { create: { tenantId: input.tenantId } },
      },
      select: USER_SELECT,
    });
    return this.toPrincipal(row);
  }

  async markLoggedIn(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null },
    });
  }

  /**
   * Counts the failure and locks the account once the limit is hit. Done in one
   * statement so parallel attempts cannot both read "4" and both write "5".
   */
  async registerFailedLogin(
    userId: string,
    maxFailures: number,
    lockSeconds: number,
  ): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });

    if (updated.failedLogins >= maxFailures) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + lockSeconds * 1000), failedLogins: 0 },
      });
    }
  }

  // ------------------------------------------------------------------ OTP

  async createOtp(input: {
    tenantId: string;
    phone: string;
    codeHash: string;
    purpose: OtpPurpose;
    expiresAt: Date;
    userId?: string | null;
  }): Promise<void> {
    await this.prisma.otpCode.create({
      data: {
        tenantId: input.tenantId,
        phone: input.phone,
        codeHash: input.codeHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
        userId: input.userId ?? null,
      },
    });
  }

  /** Newest unconsumed code for this phone; older ones are ignored. */
  async findActiveOtp(tenantId: string, phone: string, purpose: OtpPurpose) {
    return this.prisma.otpCode.findFirst({
      where: { tenantId, phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementOtpAttempts(otpId: string): Promise<number> {
    const row = await this.prisma.otpCode.update({
      where: { id: otpId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return row.attempts;
  }

  /**
   * True for the one caller that spent the code. Conditional on it being unspent, so two requests
   * carrying the right code at once cannot both sign in on it.
   */
  async consumeOtp(otpId: string): Promise<boolean> {
    const { count } = await this.prisma.otpCode.updateMany({
      where: { id: otpId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return count === 1;
  }

  /** How many codes went to this number today, for the daily cap. */
  async countOtpsSince(tenantId: string, phone: string, since: Date): Promise<number> {
    return this.prisma.otpCode.count({
      where: { tenantId, phone, createdAt: { gte: since } },
    });
  }

  async lastOtpAt(tenantId: string, phone: string): Promise<Date | null> {
    const row = await this.prisma.otpCode.findFirst({
      where: { tenantId, phone },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  // -------------------------------------------------------------- SESSIONS

  async createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    deviceId?: string | undefined;
    deviceName?: string | undefined;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<SessionRecord> {
    const row = await this.prisma.session.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
      select: { id: true, userId: true, version: true, expiresAt: true, revokedAt: true },
    });
    return row;
  }

  async findSession(sessionId: string) {
    return this.prisma.session.findUnique({ where: { id: sessionId } });
  }

  /**
   * Rotation: bump the version and store the new hash in one update. The old refresh token then
   * fails its version check, which is how token replay is detected. The update only matches the
   * version the caller read, so of two refreshes carrying the same token exactly one rotates (and
   * gets the new version back); the other gets null and is a replay.
   */
  async rotateSession(
    sessionId: string,
    expectedVersion: number,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<number | null> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, version: expectedVersion, revokedAt: null },
      data: {
        refreshTokenHash,
        expiresAt,
        version: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });
    return count === 1 ? expectedVersion + 1 : null;
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<string[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return sessions.map((session) => session.id);
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Oldest sessions beyond the per-user cap, so a device list cannot grow forever. Returns the ids it
   * revoked: their access tokens are still good until they expire unless the caller kills them too.
   */
  async trimSessions(userId: string, keep: number): Promise<string[]> {
    const stale = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      skip: keep,
      select: { id: true },
    });
    if (stale.length === 0) return [];
    const ids = stale.map((session) => session.id);
    await this.prisma.session.updateMany({
      where: { id: { in: ids } },
      data: { revokedAt: new Date() },
    });
    return ids;
  }

  async savePushToken(
    userId: string,
    token: string,
    platform: string,
    deviceId?: string,
  ): Promise<void> {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform, deviceId: deviceId ?? null },
      update: { userId, invalidAt: null, deviceId: deviceId ?? null },
    });
  }
}
