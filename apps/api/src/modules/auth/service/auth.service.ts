/**
 * Auth business logic. OTP login, JWT issue/refresh/rotation, sessions.
 */
import { effectivePermissions } from '@bazar/auth';
import type { AccessTokenPayload, AuthenticatedUser, RefreshTokenPayload } from '@bazar/auth';
import {
  DEFAULT_LOCALE,
  LIMITS,
  ROLE,
  isLocale,
  type Locale,
  type Permission,
  type Role,
} from '@bazar/constants';
import { TEMPLATE } from '@bazar/notifications';
import { randomDigits, randomToken } from '@bazar/utils';
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ERROR_CODE } from '../../../common/errors/error-codes.js';
import { RateLimitedError, UnauthorizedError } from '../../../common/errors/domain.errors.js';
import type { AuthConfig } from '../../../config/index.js';
import type { SessionStore } from '../../../infrastructure/redis/session.store.js';
import type { NotificationSender } from '../../notifications/types/index.js';
import { hashOtp, safeEqual, verifyPassword } from '../guards/index.js';
import type { AuthRepository } from '../repository/auth.repository.js';
import type { AuthResult, DeviceInfo, OtpChallenge, UserWithRoles } from '../types/index.js';

const encoder = new TextEncoder();

/** Refresh tokens are stored as a digest: a DB dump must not yield live tokens. */
const digest = (value: string): string => createHash('sha256').update(value).digest('base64');

export class TokenService {
  private readonly accessKey: Uint8Array;
  private readonly refreshKey: Uint8Array;

  constructor(
    private readonly config: AuthConfig,
    private readonly repository: AuthRepository,
    private readonly sessions: SessionStore,
  ) {
    this.accessKey = encoder.encode(config.accessSecret);
    this.refreshKey = encoder.encode(config.refreshSecret);
  }

  async signAccessToken(user: UserWithRoles, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      roles: user.roles,
      tenantId: user.tenantId,
      sessionId,
      ...(user.customerId !== null ? { customerId: user.customerId } : {}),
      ...(user.courierId !== null ? { courierId: user.courierId } : {}),
      ...(user.vendorId !== null ? { vendorId: user.vendorId } : {}),
    };

    return new SignJWT(payload as unknown as JWTPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setExpirationTime(`${this.config.accessTtlSeconds}s`)
      .sign(this.accessKey);
  }

  async signRefreshToken(
    userId: string,
    sessionId: string,
    version: number,
    tenantId: string,
  ): Promise<string> {
    const payload: RefreshTokenPayload = { sub: userId, sessionId, version, tenantId };

    return new SignJWT(payload as unknown as JWTPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setExpirationTime(`${this.config.refreshTtlSeconds}s`)
      .sign(this.refreshKey);
  }

  /**
   * Permissions are derived from the roles in the token, not stored in it.
   * A change to the role matrix then takes effect on the next request instead
   * of waiting for every issued token to expire.
   */
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    let payload: AccessTokenPayload;
    try {
      const verified = await jwtVerify(token, this.accessKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        // Pinned: without this an attacker can present alg:none or HS/RS confusion.
        algorithms: ['HS256'],
      });
      payload = verified.payload as unknown as AccessTokenPayload;
    } catch (error) {
      const expired = error instanceof Error && error.name === 'JWTExpired';
      throw new UnauthorizedError(
        expired ? 'Access token expired' : 'Invalid access token',
        expired ? ERROR_CODE.TOKEN_EXPIRED : ERROR_CODE.TOKEN_INVALID,
      );
    }

    if (await this.sessions.isRevoked(payload.sessionId)) {
      throw new UnauthorizedError('Session revoked', ERROR_CODE.SESSION_REVOKED);
    }

    const roles = payload.roles as Role[];
    return {
      id: payload.sub,
      roles,
      permissions: effectivePermissions(roles) as Permission[],
      tenantId: payload.tenantId,
      sessionId: payload.sessionId,
      locale: DEFAULT_LOCALE,
      ...(payload.customerId !== undefined ? { customerId: payload.customerId } : {}),
      ...(payload.courierId !== undefined ? { courierId: payload.courierId } : {}),
      ...(payload.vendorId !== undefined ? { vendorId: payload.vendorId } : {}),
    };
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const verified = await jwtVerify(token, this.refreshKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
      });
      return verified.payload as unknown as RefreshTokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid refresh token', ERROR_CODE.TOKEN_INVALID);
    }
  }

  /** Issues a fresh pair and records the session. Used by login and by refresh. */
  async issue(user: UserWithRoles, device: DeviceInfo, sessionId?: string): Promise<AuthResult> {
    const refreshExpiresAt = new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
    const rawRefresh = randomToken();

    const session =
      sessionId === undefined
        ? await this.repository.createSession({
            userId: user.id,
            refreshTokenHash: digest(rawRefresh),
            expiresAt: refreshExpiresAt,
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            ip: device.ip ?? null,
            userAgent: device.userAgent ?? null,
          })
        : {
            id: sessionId,
            userId: user.id,
            version: await this.repository.rotateSession(
              sessionId,
              digest(rawRefresh),
              refreshExpiresAt,
            ),
            expiresAt: refreshExpiresAt,
            revokedAt: null,
          };

    await this.repository.trimSessions(user.id, LIMITS.MAX_SESSIONS_PER_USER);

    const [accessToken, refreshToken] = await Promise.all([
      this.signAccessToken(user, session.id),
      this.signRefreshToken(user.id, session.id, session.version, user.tenantId),
    ]);

    return {
      accessToken,
      // The client gets the JWT; the database holds only its digest, and the
      // raw value below is what the digest was taken of.
      refreshToken: `${refreshToken}.${rawRefresh}`,
      expiresIn: this.config.accessTtlSeconds,
      user: this.principal(user, session.id),
      isNewUser: false,
    };
  }

  principal(user: UserWithRoles, sessionId: string): AuthenticatedUser {
    return {
      id: user.id,
      roles: user.roles,
      permissions: effectivePermissions(user.roles, user.extraPermissions as Permission[]),
      tenantId: user.tenantId,
      sessionId,
      locale: isLocale(user.locale) ? user.locale : DEFAULT_LOCALE,
      phone: user.phone,
      ...(user.customerId !== null ? { customerId: user.customerId } : {}),
      ...(user.courierId !== null ? { courierId: user.courierId } : {}),
      ...(user.vendorId !== null ? { vendorId: user.vendorId } : {}),
    };
  }
}

export interface AuthServiceDeps extends ServiceDeps {
  config: AuthConfig;
  repository: AuthRepository;
  tokens: TokenService;
  sessions: SessionStore;
  notifications: NotificationSender;
}

export class AuthService extends BaseService {
  private readonly config: AuthConfig;
  private readonly repository: AuthRepository;
  private readonly tokens: TokenService;
  private readonly sessions: SessionStore;
  private readonly notifications: NotificationSender;

  constructor(deps: AuthServiceDeps) {
    super(deps);
    this.config = deps.config;
    this.repository = deps.repository;
    this.tokens = deps.tokens;
    this.sessions = deps.sessions;
    this.notifications = deps.notifications;
  }

  /**
   * Sends a login code. Answers identically whether or not the phone is known:
   * this endpoint must not become a way to enumerate customers.
   */
  async requestOtp(tenantId: string, phone: string, locale: Locale): Promise<OtpChallenge> {
    const lastSentAt = await this.repository.lastOtpAt(tenantId, phone);
    if (lastSentAt !== null) {
      const elapsed = (Date.now() - lastSentAt.getTime()) / 1000;
      if (elapsed < LIMITS.OTP_RESEND_COOLDOWN_SECONDS) {
        throw new RateLimitedError(Math.ceil(LIMITS.OTP_RESEND_COOLDOWN_SECONDS - elapsed));
      }
    }

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const sentToday = await this.repository.countOtpsSince(tenantId, phone, dayAgo);
    if (sentToday >= LIMITS.OTP_MAX_PER_DAY) {
      // Each SMS costs money, and a number being hammered is either an attack
      // or a bug on the client.
      throw new RateLimitedError(3600, 'Daily code limit reached');
    }

    const code = randomDigits(this.config.otpLength);
    const expiresAt = new Date(Date.now() + this.config.otpTtlSeconds * 1000);

    await this.repository.createOtp({
      tenantId,
      phone,
      codeHash: await hashOtp(code, this.config.sessionSecret),
      purpose: 'LOGIN',
      expiresAt,
    });

    await this.notifications.sendDirect({
      tenantId,
      phone,
      locale,
      template: TEMPLATE.AUTH_OTP,
      params: { code, minutes: Math.round(this.config.otpTtlSeconds / 60) },
    });

    this.logger.info({ phone: phone.slice(0, 7) }, 'otp sent');

    return {
      retryAfter: LIMITS.OTP_RESEND_COOLDOWN_SECONDS,
      expiresIn: this.config.otpTtlSeconds,
      codeLength: this.config.otpLength,
    };
  }

  /** Verifies the code and signs the caller in, creating the account if new. */
  async verifyOtp(
    tenantId: string,
    phone: string,
    code: string,
    device: DeviceInfo,
    locale: Locale,
  ): Promise<AuthResult> {
    const otp = await this.repository.findActiveOtp(tenantId, phone, 'LOGIN');
    if (otp === null) {
      throw new UnauthorizedError('Code expired or not requested', ERROR_CODE.OTP_EXPIRED);
    }

    if (otp.attempts >= LIMITS.OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedError('Too many attempts', ERROR_CODE.OTP_ATTEMPTS_EXCEEDED);
    }

    const expected = await hashOtp(code, this.config.sessionSecret);
    if (!safeEqual(expected, otp.codeHash)) {
      const attempts = await this.repository.incrementOtpAttempts(otp.id);
      throw new UnauthorizedError(
        'Invalid code',
        attempts >= LIMITS.OTP_MAX_ATTEMPTS
          ? ERROR_CODE.OTP_ATTEMPTS_EXCEEDED
          : ERROR_CODE.INVALID_OTP,
      );
    }

    // Burn the code before issuing tokens: a code must work exactly once.
    await this.repository.consumeOtp(otp.id);

    const existing = await this.repository.findByPhone(tenantId, phone);
    const isNewUser = existing === null;
    const user =
      existing ??
      (await this.repository.createUser({ tenantId, phone, locale, roles: [ROLE.CUSTOMER] }));

    this.assertUsable(user);
    await this.repository.markLoggedIn(user.id);

    const result = await this.tokens.issue(user, device);

    if (device.pushToken !== undefined) {
      await this.repository.savePushToken(user.id, device.pushToken, 'unknown', device.deviceId);
    }

    return { ...result, isNewUser };
  }

  /** Password sign-in, for staff accounts only. */
  async login(
    tenantId: string,
    phone: string,
    password: string,
    device: DeviceInfo,
  ): Promise<AuthResult> {
    const user = await this.repository.findByPhone(tenantId, phone);

    // Same error and roughly the same work either way: a faster "no such user"
    // response is itself an answer.
    if (user === null || user.passwordHash === null) {
      throw new UnauthorizedError('Invalid phone or password', ERROR_CODE.INVALID_CREDENTIALS);
    }

    if (user.lockedUntil !== null && user.lockedUntil > new Date()) {
      throw new UnauthorizedError('Account temporarily locked', ERROR_CODE.ACCOUNT_LOCKED);
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      await this.repository.registerFailedLogin(
        user.id,
        LIMITS.LOGIN_MAX_FAILURES,
        LIMITS.LOGIN_LOCKOUT_SECONDS,
      );
      throw new UnauthorizedError('Invalid phone or password', ERROR_CODE.INVALID_CREDENTIALS);
    }

    this.assertUsable(user);
    await this.repository.markLoggedIn(user.id);
    return this.tokens.issue(user, device);
  }

  /**
   * Rotates the refresh token. A token whose version is behind the session was
   * already used, which means it leaked: the whole session dies rather than
   * letting both the thief and the owner keep refreshing.
   */
  async refresh(token: string, device: DeviceInfo): Promise<AuthResult> {
    const [jwt, raw] = token.split('.').length > 3 ? splitCompound(token) : [token, ''];
    const payload = await this.tokens.verifyRefreshToken(jwt);

    const session = await this.repository.findSession(payload.sessionId);
    if (session === null || session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedError('Session is no longer valid', ERROR_CODE.SESSION_REVOKED);
    }

    if (payload.version !== session.version || !safeEqual(digest(raw), session.refreshTokenHash)) {
      await this.repository.revokeSession(session.id);
      await this.sessions.revoke(session.id, this.config.accessTtlSeconds);
      this.logger.warn({ sessionId: session.id }, 'refresh token reuse detected, session revoked');
      throw new UnauthorizedError('Refresh token already used', ERROR_CODE.SESSION_REVOKED);
    }

    const user = await this.repository.findById(payload.sub);
    if (user === null) throw new UnauthorizedError();
    this.assertUsable(user);

    return this.tokens.issue(user, device, session.id);
  }

  async logout(sessionId: string): Promise<void> {
    await this.repository.revokeSession(sessionId);
    // Redis entry makes the still-valid access token stop working immediately.
    await this.sessions.revoke(sessionId, this.config.accessTtlSeconds);
  }

  async logoutAll(userId: string): Promise<void> {
    const revoked = await this.repository.revokeAllSessions(userId);
    await this.sessions.revokeAllForUser(userId, revoked, this.config.accessTtlSeconds);
  }

  async listSessions(userId: string) {
    return this.repository.listSessions(userId);
  }

  private assertUsable(user: UserWithRoles): void {
    if (user.status === 'BLOCKED' || user.status === 'DELETED') {
      throw new UnauthorizedError('Account is blocked', ERROR_CODE.ACCOUNT_BLOCKED);
    }
  }
}

/** The refresh token travels as `<jwt>.<raw>`; the JWT itself has three parts. */
function splitCompound(token: string): [string, string] {
  const index = token.lastIndexOf('.');
  return [token.slice(0, index), token.slice(index + 1)];
}
