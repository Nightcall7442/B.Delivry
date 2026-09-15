/**
 * Addresses HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toAddressDto } from '../../../common/dto/index.js';
import { body, params } from '../../../middleware/validation.middleware.js';
import type { AddressesService } from '../service/addresses.service.js';
import type { AddressInput } from '../types/index.js';

export class AddressesController extends BaseController {
  constructor(private readonly service: AddressesService) {
    super();
  }

  list = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, (await this.service.list()).map(toAddressDto));

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toAddressDto(await this.service.get(id)));
  };

  create = async (request: FastifyRequest, reply: FastifyReply) =>
    this.created(reply, toAddressDto(await this.service.create(body<AddressInput>(request))));

  update = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(
      reply,
      toAddressDto(await this.service.update(id, body<Partial<AddressInput>>(request))),
    );
  };

  setDefault = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.setDefault(id);
    this.noContent(reply);
  };

  remove = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.remove(id);
    this.noContent(reply);
  };

  checkDeliverable = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, { deliverable: await this.service.isDeliverable(id) });
  };
}
