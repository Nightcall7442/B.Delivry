/**
 * Auth HTTP controller — thin: validate → call service → map response.
 */
import type { LoginInput, RequestOtpInput, VerifyOtpInput } from '@bazar/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { UnauthorizedError } from '../../../common/errors/domain.errors.js';
import { TenantNotResolvedError } from '../../../common/errors/domain.errors.js';
import { body } from '../../../middleware/validation.middleware.js';
import type { AuthService } from '../service/auth.service.js';
import type { DeviceInfo } from '../types/index.js';

export class AuthController extends BaseController {
  constructor(private readonly service: AuthService) {
    super();
  }

  private device(request: FastifyRequest, extra: Partial<DeviceInfo> = {}): DeviceInfo {
    return {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      ...extra,
    };
  }

  /** Auth runs before the tenant hook needs a user, so read the tenant directly. */
  private tenantId(request: FastifyRequest): string {
    const tenantId = request.tenant?.tenantId ?? request.ctx?.tenantId;
    if (tenantId === undefined) throw new TenantNotResolvedError();
    return tenantId;
  }

  requestOtp = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<RequestOtpInput>(request);
    const result = await this.service.requestOtp(
      this.tenantId(request),
      input.phone,
      input.locale ?? request.locale,
    );
    return this.ok(reply, result);
  };

  verifyOtp = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<VerifyOtpInput>(request);
    const result = await this.service.verifyOtp(
      this.tenantId(request),
      input.phone,
      input.code,
      this.device(request, {
        deviceId: input.deviceId,
        deviceName: input.deviceName,
        pushToken: input.pushToken,
      }),
      request.locale,
    );
    return this.ok(reply, result);
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<LoginInput>(request);
    const result = await this.service.login(
      this.tenantId(request),
      input.phone,
      input.password,
      this.device(request, { deviceId: input.deviceId }),
    );
    return this.ok(reply, result);
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<{ refreshToken: string }>(request);
    return this.ok(reply, await this.service.refresh(input.refreshToken, this.device(request)));
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (user === null || user === undefined) throw new UnauthorizedError();
    await this.service.logout(user.sessionId);
    this.noContent(reply);
  };

  logoutAll = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (user === null || user === undefined) throw new UnauthorizedError();
    await this.service.logoutAll(user.id);
    this.noContent(reply);
  };

  sessions = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (user === null || user === undefined) throw new UnauthorizedError();
    const sessions = await this.service.listSessions(user.id);
    return this.ok(
      reply,
      sessions.map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        current: session.id === user.sessionId,
      })),
    );
  };
}
