/**
 * Haggle HTTP controller — thin: validate → call service → map response.
 */
import type { AnswerHaggleInput, CreateHaggleInput } from '@bazar/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toHaggleDto } from '../../../common/dto/index.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { HaggleService } from '../service/haggle.service.js';

export class HaggleController extends BaseController {
  constructor(private readonly service: HaggleService) {
    super();
  }

  ask = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, toHaggleDto(await this.service.ask(body<CreateHaggleInput>(request))));

  mine = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, (await this.service.mine()).map(toHaggleDto));

  forStore = async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = query<{ storeId: string }>(request);
    return this.ok(reply, (await this.service.forStore(storeId)).map(toHaggleDto));
  };

  answer = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(
      reply,
      toHaggleDto(await this.service.answer(id, body<AnswerHaggleInput>(request))),
    );
  };
}
