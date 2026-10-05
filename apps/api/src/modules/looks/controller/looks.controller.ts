/**
 * «Покажите товар» HTTP controller — thin: validate → call service → map response.
 */
import type { AnswerLookInput, AskLookInput } from '@bazar/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toLookDto } from '../../../common/dto/index.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { LooksService } from '../service/looks.service.js';

export class LooksController extends BaseController {
  constructor(private readonly service: LooksService) {
    super();
  }

  ask = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, toLookDto(await this.service.ask(body<AskLookInput>(request).productId)));

  mine = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = query<{ productId?: string }>(request);
    return this.ok(
      reply,
      (await this.service.mine(productId)).map((row) => toLookDto(row)),
    );
  };

  forStore = async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = query<{ storeId: string }>(request);
    return this.ok(
      reply,
      (await this.service.forStore(storeId)).map((row) => toLookDto(row)),
    );
  };

  answer = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { photoUrl } = body<AnswerLookInput>(request);
    return this.ok(reply, toLookDto(await this.service.answer(id, photoUrl)));
  };

  livePhotos = async (request: FastifyRequest, reply: FastifyReply) => {
    const { productId } = params<{ productId: string }>(request);
    return this.ok(reply, await this.service.livePhotos(productId));
  };
}
