/**
 * Admin HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { toPublicTenantDto, toTenantDto } from '../../../common/dto/index.js';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, query } from '../../../middleware/validation.middleware.js';
import type { AdminService } from '../service/admin.service.js';
import type { UpdateSettingsBody } from '../schemas/index.js';

export class AdminController extends BaseController {
  constructor(private readonly service: AdminService) {
    super();
  }

  tenant = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.tenant());

  settings = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.getSettings());

  updateSettings = async (request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.updateSettings(body<UpdateSettingsBody>(request)));

  updateBranding = async (request: FastifyRequest, reply: FastifyReply) =>
    this.ok(
      reply,
      toTenantDto(
        await this.service.updateBranding(
          body<{ name?: string; branding: Record<string, unknown> }>(request),
        ),
      ),
    );

  publicTenant = async (request: FastifyRequest, reply: FastifyReply) => {
    const { host } = query<{ host?: string }>(request);
    const tenant = await this.service.publicTenant(host);
    return this.ok(reply, toPublicTenantDto(tenant));
  };

  monitoring = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.monitoring());
}
