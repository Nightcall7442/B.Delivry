/**
 * Couriers HTTP controller — thin: validate → call service → map response.
 */
import { toCourierDto, toCourierShiftDto } from '../../../common/dto/index.js';
import type { CourierStatus } from '@bazar/constants';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { CouriersService } from '../service/couriers.service.js';
import type { CourierListFilters, RegisterCourierInput } from '../types/index.js';

export class CouriersController extends BaseController {
  constructor(private readonly service: CouriersService) {
    super();
  }

  applyNeighbour = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(
      reply,
      toCourierDto(
        await this.service.applyNeighbour(body<{ addressId: string }>(request).addressId),
      ),
    );

  me = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, toCourierDto(await this.service.me()));

  shift = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, toCourierShiftDto(await this.service.shift()));

  balance = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.balance());

  setStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const { status } = body<{ status: CourierStatus }>(request);
    return this.ok(reply, toCourierDto(await this.service.setStatus(status)));
  };

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const page = await this.service.list(query<CourierListFilters>(request));
    return this.paginated(reply, { ...page, items: page.items.map((row) => toCourierDto(row)) });
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toCourierDto(await this.service.get(id)));
  };

  register = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(
      reply,
      toCourierDto(await this.service.register(body<RegisterCourierInput>(request))),
    );

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(
      reply,
      toCourierDto(await this.service.update(id, body<Record<string, unknown>>(request))),
    );
  };

  verify = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toCourierDto(await this.service.verify(id)));
  };

  suspend = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.suspend(id);
    this.noContent(reply);
  };
}
