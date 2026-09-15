/**
 * Geo HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { body, params, query } from '../../../middleware/validation.middleware.js';
import type { GeoService } from '../service/geo.service.js';
import type { PlaceListQuery, UpdateZoneInput } from '../schemas/index.js';

export class GeoController extends BaseController {
  constructor(private readonly service: GeoService) {
    super();
  }

  listPlaces = async (request: FastifyRequest, reply: FastifyReply) => {
    const { level, parentId } = query<PlaceListQuery>(request);
    return this.ok(reply, await this.service.listPlaces(level, parentId));
  };

  listCities = async (_request: FastifyRequest, reply: FastifyReply) => {
    return this.ok(reply, await this.service.listCities());
  };

  resolveZone = async (request: FastifyRequest, reply: FastifyReply) => {
    const { lat, lng } = query<{ lat: number; lng: number }>(request);
    const resolution = await this.service.resolveZone({ lat, lng });
    return this.ok(reply, {
      deliverable: resolution.deliverable,
      cityId: resolution.cityId,
      zone:
        resolution.zone === null
          ? null
          : {
              id: resolution.zone.id,
              name: resolution.zone.name,
              tariffId: resolution.zone.tariffId,
            },
      reason: resolution.reason,
    });
  };

  geocode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { query: text, lat, lng } = query<{ query: string; lat?: number; lng?: number }>(request);
    const near = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    return this.ok(reply, await this.service.geocode(text, near));
  };

  reverseGeocode = async (request: FastifyRequest, reply: FastifyReply) => {
    const { lat, lng } = query<{ lat: number; lng: number }>(request);
    return this.ok(reply, await this.service.reverseGeocode({ lat, lng }));
  };

  autocomplete = async (request: FastifyRequest, reply: FastifyReply) => {
    const { query: text, lat, lng } = query<{ query: string; lat?: number; lng?: number }>(request);
    const near = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    return this.ok(reply, await this.service.autocomplete(text, near));
  };

  listZones = async (request: FastifyRequest, reply: FastifyReply) => {
    const { cityId } = query<{ cityId: string }>(request);
    return this.ok(reply, await this.service.listZones(cityId));
  };

  createZone = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = body<Parameters<GeoService['createZone']>[0]>(request);
    return this.created(reply, await this.service.createZone(input));
  };

  updateZone = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, await this.service.updateZone(id, body<UpdateZoneInput>(request)));
  };

  deleteZone = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    await this.service.deleteZone(id);
    this.noContent(reply);
  };
}
