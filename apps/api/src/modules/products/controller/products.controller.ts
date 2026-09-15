/**
 * Products HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { ProductsService } from '../service/products.service.js';
import type { CreateProductInput, ProductListFilters, UpdateProductInput } from '../types/index.js';

export class ProductsController extends BaseController {
  constructor(private readonly service: ProductsService) {
    super();
  }

  list = async (request: FastifyRequest, reply: FastifyReply) =>
    this.paginated(reply, await this.service.list(query<ProductListFilters>(request)));

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.get(id));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, await this.service.create(body<CreateProductInput>(request)));

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.update(id, body<UpdateProductInput>(request)));
  };

  setAvailability = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { available } = body<{ available: boolean }>(request);
    await this.service.setAvailability(id, available);
    this.noContent(reply);
  };

  priceHistory = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.priceHistory(id));
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.remove(id);
    this.noContent(reply);
  };
}
