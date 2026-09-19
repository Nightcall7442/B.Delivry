/**
 * Stores HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toStoreDto } from '../../../common/dto/index.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { ProductsService } from '../../products/service/products.service.js';
import type { StoresService } from '../service/stores.service.js';
import type { StoresListQuery } from '../schemas/index.js';

export class StoresController extends BaseController {
  constructor(
    private readonly service: StoresService,
    private readonly products: ProductsService,
  ) {
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

  importProducts = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { csv } = body<{ csv: string }>(request);
    return this.ok(reply, await this.products.importCsv(id, csv));
  };

  /** CSV: one delivered order per line, totals at the end — what a shop's accountant asks for. */
  report = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { from, to } = request.query as { from?: string; to?: string };
    const csv = await this.service.report(id, from, to);
    // JSON like every other endpoint; the cabinet turns it into a download itself.
    return this.ok(reply, { filename: `report-${from ?? 'month'}-${id.slice(0, 8)}.csv`, csv });
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
