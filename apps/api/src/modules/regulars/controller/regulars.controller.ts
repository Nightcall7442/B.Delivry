/**
 * «Свой продавец» HTTP controller — thin: validate → call service → map response.
 */
import type { RegularNoteInput } from '@bazar/validation';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params } from '../../../middleware/validation.middleware.js';
import type { RegularsService } from '../service/regulars.service.js';

export class RegularsController extends BaseController {
  constructor(private readonly service: RegularsService) {
    super();
  }

  forOrder = async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = params<{ orderId: string }>(request);
    return this.ok(reply, await this.service.forOrder(orderId));
  };

  setNote = async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = params<{ orderId: string }>(request);
    return this.ok(
      reply,
      await this.service.setNote(orderId, body<RegularNoteInput>(request).note),
    );
  };

  mine = async (request: FastifyRequest, reply: FastifyReply) => {
    const { storeId } = params<{ storeId: string }>(request);
    return this.ok(reply, await this.service.mine(storeId));
  };
}
