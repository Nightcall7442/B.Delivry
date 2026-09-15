/**
 * Stores HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toStoreDto } from '../../../common/dto/index.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { StoresService } from '../service/stores.service.js';
import type { StoresListQuery } from '../schemas/index.js';

export class StoresController extends BaseController {
  constructor(private readonly service: StoresService) {
    super();
  }

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const filters = query<StoresListQuery>(request);
    const result = await this.service.list(filters);
    // isOpen is computed, not stored: it depends on the clock.
    return this.paginated(reply, {
      ...result,
      items: result.items.map((store) => toStoreDto(store, this.service.isOpen(store))),
    });
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const store = await this.service.get(id);
    return this.ok(reply, toStoreDto(store, this.service.isOpen(store)));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    return this.created(reply, await this.service.create(body(request)));
  };

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.update(id, body<Record<string, unknown>>(request)));
  };

  setSchedule = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { schedule } = body<{ schedule: Parameters<StoresService['setSchedule']>[1] }>(request);
    return this.ok(reply, await this.service.setSchedule(id, schedule));
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.remove(id);
    this.noContent(reply);
  };

  markArrivals = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(
      reply,
      await this.service.markArrivals(
        id,
        body<{ productIds: string[]; announce: boolean; photoUrl?: string }>(request),
      ),
    );
  };
}
