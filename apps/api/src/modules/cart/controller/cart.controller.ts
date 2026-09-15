/**
 * Cart HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params } from '../../../middleware/validation.middleware.js';
import type { CartService } from '../service/cart.service.js';
import type { AddItemInput } from '../types/index.js';

export class CartController extends BaseController {
  constructor(private readonly service: CartService) {
    super();
  }

  list = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.list());

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = params<{ storeId: string }>(request);
    return this.ok(reply, await this.service.get(storeId));
  };

  addItem = async (request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.addItem(body<AddItemInput>(request)));

  updateItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId, itemId } = params<{ storeId: string; itemId: string }>(request);
    const { quantity, comment } = body<{ quantity: number; comment?: string }>(request);
    return this.ok(reply, await this.service.updateItem(storeId, itemId, quantity, comment));
  };

  removeItem = async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId, itemId } = params<{ storeId: string; itemId: string }>(request);
    return this.ok(reply, await this.service.removeItem(storeId, itemId));
  };

  clear = async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = params<{ storeId: string }>(request);
    await this.service.clearOwn(storeId);
    this.noContent(reply);
  };
}
