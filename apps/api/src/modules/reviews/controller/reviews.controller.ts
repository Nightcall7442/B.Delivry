/**
 * Reviews HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { ReviewsService } from '../service/reviews.service.js';
import type { CreateReviewInput, ReviewListFilters, ReviewTarget } from '../types/index.js';

export class ReviewsController extends BaseController {
  constructor(private readonly service: ReviewsService) {
    super();
  }

  list = async (request: FastifyRequest, reply: FastifyReply) =>
    this.paginated(reply, await this.service.list(query<ReviewListFilters>(request)));

  summary = async (request: FastifyRequest, reply: FastifyReply) => {
    const { target, targetId } = query<{ target: ReviewTarget; targetId: string }>(request);
    return this.ok(reply, await this.service.summary(target, targetId));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, await this.service.create(body<CreateReviewInput>(request)));

  reply = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const input = body<{ reply: string }>(request);
    return this.ok(reply, await this.service.reply(id, input.reply));
  };

  setPublished = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { published } = body<{ published: boolean }>(request);
    return this.ok(reply, await this.service.setPublished(id, published));
  };
}
