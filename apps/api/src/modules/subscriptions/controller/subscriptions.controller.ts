/**
 * Subscriptions HTTP controller — thin: validate → call service → map response.
 */
import type { CreateSubscriptionInput, UpdateSubscriptionInput } from '@bazar/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toSubscriptionDto } from '../../../common/dto/index.js';
import { body, params } from '../../../middleware/validation.middleware.js';
import type { SubscriptionsService } from '../service/subscriptions.service.js';

export class SubscriptionsController extends BaseController {
  constructor(private readonly service: SubscriptionsService) {
    super();
  }

  list = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, (await this.service.list()).map(toSubscriptionDto));

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(
      reply,
      toSubscriptionDto(await this.service.create(body<CreateSubscriptionInput>(request))),
    );

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(
      reply,
      toSubscriptionDto(await this.service.update(id, body<UpdateSubscriptionInput>(request))),
    );
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.remove(id);
    this.noContent(reply);
  };
}
