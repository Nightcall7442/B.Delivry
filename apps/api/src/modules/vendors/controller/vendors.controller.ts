/**
 * Vendors HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { VendorsService } from '../service/vendors.service.js';
import type { CreateVendorInput, VendorListFilters, VendorStatus } from '../types/index.js';

export class VendorsController extends BaseController {
  constructor(private readonly service: VendorsService) {
    super();
  }

  me = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.me());

  myPayout = async (request: FastifyRequest, reply: FastifyReply) => {
    const { since } = query<{ since?: string }>(request);
    return this.ok(
      reply,
      await this.service.myPayout(since === undefined ? undefined : new Date(since)),
    );
  };

  list = async (request: FastifyRequest, reply: FastifyReply) =>
    this.paginated(reply, await this.service.list(query<VendorListFilters>(request)));

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.get(id));
  };

  register = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, await this.service.register(body<CreateVendorInput>(request)));

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.update(id, body<Record<string, unknown>>(request)));
  };

  setStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { status } = body<{ status: VendorStatus }>(request);
    await this.service.setStatus(id, status);
    this.noContent(reply);
  };

  setCommission = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { commissionPercent } = body<{ commissionPercent: number | null }>(request);
    return this.ok(reply, await this.service.setCommission(id, commissionPercent));
  };

  payout = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { since } = query<{ since?: string }>(request);
    return this.ok(
      reply,
      await this.service.payout(id, since === undefined ? undefined : new Date(since)),
    );
  };
}
