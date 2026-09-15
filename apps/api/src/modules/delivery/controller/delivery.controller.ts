/**
 * Delivery HTTP controller — thin: validate → call service → map response.
 */
import { toDeliveryDto } from '../../../common/dto/index.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { DeliveryService } from '../service/delivery.service.js';
import type { CompleteDeliveryInput, DeliveryListQuery } from '../schemas/index.js';

export class DeliveryController extends BaseController {
  constructor(private readonly service: DeliveryService) {
    super();
  }

  list = async (request: FastifyRequest, reply: FastifyReply) => {
    const { from, to, ...rest } = query<DeliveryListQuery>(request);

    const page = await this.service.list({
      ...rest,
      ...(from !== undefined ? { from: new Date(from) } : {}),
      ...(to !== undefined ? { to: new Date(to) } : {}),
    });
    return this.paginated(reply, { ...page, items: page.items.map(toDeliveryDto) });
  };

  active = async (_request: FastifyRequest, reply: FastifyReply) =>
    this.ok(reply, (await this.service.activeForCourier()).map(toDeliveryDto));

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toDeliveryDto(await this.service.get(id)));
  };

  accept = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toDeliveryDto(await this.service.accept(id)));
  };

  decline = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.decline(id);
    this.noContent(reply);
  };

  arrivedAtPickup = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toDeliveryDto(await this.service.arrivedAtPickup(id)));
  };

  pickedUp = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toDeliveryDto(await this.service.pickedUp(id)));
  };

  assign = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { courierId } = body<{ courierId: string }>(request);
    return this.ok(reply, toDeliveryDto(await this.service.assign(id, courierId)));
  };

  restartSearch = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.restartSearch(id);
    this.noContent(reply);
  };

  arrivedAtDropoff = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toDeliveryDto(await this.service.arrivedAtDropoff(id)));
  };

  complete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const input = body<CompleteDeliveryInput>(request);
    return this.ok(
      reply,
      toDeliveryDto(
        await this.service.complete(id, {
          proofUrl: input.proofUrl,
          handoverCode: input.handoverCode,
          ...(input.lat !== undefined && input.lng !== undefined
            ? { point: { lat: input.lat, lng: input.lng } }
            : {}),
        }),
      ),
    );
  };

  fail = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { reason, photoUrl } = body<{ reason: string; photoUrl?: string }>(request);
    return this.ok(reply, toDeliveryDto(await this.service.fail(id, reason, photoUrl)));
  };

  /** Operator pulls the order back from a courier who went silent. */
  release = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    const { reason } = body<{ reason: string }>(request);
    await this.service.release(id, reason);
    this.noContent(reply);
  };
}
