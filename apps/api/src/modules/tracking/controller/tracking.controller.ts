/**
 * Tracking HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { TrackingService } from '../service/tracking.service.js';
import type { LocationPing } from '../types/index.js';
import type { PushLocationBatchInput, PushLocationInput } from '../schemas/index.js';

/** A ping with no device clock is treated as "just now". */
const toPing = (input: PushLocationInput): LocationPing => ({
  lat: input.lat,
  lng: input.lng,
  heading: input.heading,
  speedKmh: input.speedKmh,
  accuracyMeters: input.accuracyMeters,
  recordedAt: input.recordedAt === undefined ? new Date() : new Date(input.recordedAt),
  orderId: input.orderId,
});

export class TrackingController extends BaseController {
  constructor(private readonly service: TrackingService) {
    super();
  }

  push = async (request: FastifyRequest, reply: FastifyReply) => {
    await this.service.push([toPing(body<PushLocationInput>(request))]);
    this.noContent(reply);
  };

  pushBatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const { points } = body<PushLocationBatchInput>(request);
    await this.service.push(points.map(toPing));
    this.noContent(reply);
  };

  trackOrder = async (request: FastifyRequest, reply: FastifyReply) => {
    const { orderId } = params<{ orderId: string }>(request);
    return this.ok(reply, await this.service.trackOrder(orderId));
  };

  history = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = query<{
      orderId?: string;
      courierId?: string;
      from?: string;
      to?: string;
      limit?: number;
    }>(request);

    // Built field by field rather than spread: the query carries ISO strings
    // where the filter wants Dates, and spreading would smuggle both types in.
    return this.ok(
      reply,
      await this.service.history({
        ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
        ...(input.courierId !== undefined ? { courierId: input.courierId } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.from !== undefined ? { from: new Date(input.from) } : {}),
        ...(input.to !== undefined ? { to: new Date(input.to) } : {}),
      }),
    );
  };

  liveMap = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cityId } = query<{ cityId: string }>(request);
    return this.ok(reply, await this.service.liveMap(cityId));
  };
}
