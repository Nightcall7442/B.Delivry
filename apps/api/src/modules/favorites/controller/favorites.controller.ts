/**
 * Favorites HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { params } from '../../../middleware/validation.middleware.js';
import type { FavoritesService } from '../service/favorites.service.js';

export class FavoritesController extends BaseController {
  constructor(private readonly service: FavoritesService) {
    super();
  }

  list = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.list());

  addProduct = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.add('product', params<{ productId: string }>(request).productId);
    this.noContent(reply);
  };

  removeProduct = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.remove('product', params<{ productId: string }>(request).productId);
    this.noContent(reply);
  };

  addStore = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.add('store', params<{ storeId: string }>(request).storeId);
    this.noContent(reply);
  };

  removeStore = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.remove('store', params<{ storeId: string }>(request).storeId);
    this.noContent(reply);
  };
}
