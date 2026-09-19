/**
 * Categories HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { CategoriesService } from '../service/categories.service.js';
import type { CreateCategoryInput, UpdateCategoryInput } from '../types/index.js';

export class CategoriesController extends BaseController {
  constructor(private readonly service: CategoriesService) {
    super();
  }

  tree = async (request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, await this.service.tree(query<{ storeId?: string }>(request).storeId));

  children = async (request: FastifyRequest, reply: FastifyReply) => {
    const { parentId, root } = query<{ parentId?: string; root?: boolean }>(request);
    return this.ok(reply, await this.service.children(root === true ? null : (parentId ?? null)));
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.get(id));
  };

  subtree = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, { ids: await this.service.subtreeIds(id) });
  };

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, await this.service.create(body<CreateCategoryInput>(request)));

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.update(id, body<UpdateCategoryInput>(request)));
  };

  deactivate = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, { deactivated: await this.service.deactivate(id) });
  };
}
