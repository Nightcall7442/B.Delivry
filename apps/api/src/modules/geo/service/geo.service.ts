/**
 * Geo business logic. Geo: cities, regions, districts, mahallas, delivery zones, geofencing, MapProvider usage.
 */
import { GEO_LEVEL, PERMISSION, type GeoLevel } from '@bazar/constants';
import type { LatLng, MapProvider } from '@bazar/maps';
import type { DeliveryZone, GeoPlace } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { NotFoundError } from '../../../common/errors/domain.errors.js';
import { cached, type CacheStore } from '../../../infrastructure/redis/cache.js';
import { PolygonGeofence } from '../domain/geofence.js';
import type { GeoRepository } from '../repository/geo.repository.js';
import type {
  PlaceInput,
  ZoneInput,
  ZoneResolution,
  ZoneUpdate,
  ZoneWithPolygon,
} from '../types/index.js';

/** Reference data changes a few times a year and is read on every checkout. */
const CACHE_TTL_SECONDS = 3600;
const CACHE_TAG = 'geo';

export interface GeoServiceDeps extends ServiceDeps {
  repository: GeoRepository;
  cache: CacheStore;
  maps: MapProvider;
}

export class GeoService extends BaseService {
  private readonly repository: GeoRepository;
  private readonly cache: CacheStore;
  private readonly maps: MapProvider;
  private readonly geofence = new PolygonGeofence();

  constructor(deps: GeoServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.cache = deps.cache;
    this.maps = deps.maps;
  }

  async listPlaces(level?: GeoLevel, parentId?: string): Promise<GeoPlace[]> {
    return cached(
      this.cache,
      `places:${level ?? 'all'}:${parentId ?? 'root'}`,
      CACHE_TTL_SECONDS,
      () => this.repository.listPlaces(level, parentId),
      [CACHE_TAG],
    );
  }

  async listCities(): Promise<GeoPlace[]> {
    return this.listPlaces(GEO_LEVEL.CITY);
  }

  async getPlace(id: string): Promise<GeoPlace> {
    const place = await this.repository.findPlace(id);
    if (place === null) throw new NotFoundError('Place', id);
    return place;
  }

  /**
   * Which zone covers a point, and therefore whether delivery is possible at
   * all and under which tariff. Called on every quote and every order.
   */
  async resolveZone(point: LatLng, cityId?: string): Promise<ZoneResolution> {
    const zones = await this.zonesFor(cityId);
    const zone = this.geofence.locate(point, zones);

    if (zone === null) {
      return {
        zone: null,
        cityId: cityId ?? null,
        deliverable: false,
        reason: 'Address is outside every delivery zone',
      };
    }

    return { zone, cityId: zone.cityId, deliverable: true, reason: null };
  }

  private async zonesFor(cityId?: string): Promise<ZoneWithPolygon[]> {
    // Without a city the point could be anywhere, so every zone is a candidate.
    // Callers that know the city (most of them) get a far smaller list.
    return cached(
      this.cache,
      `zones:${cityId ?? 'all'}`,
      CACHE_TTL_SECONDS,
      () =>
        cityId === undefined ? this.repository.listAllZones() : this.repository.listZones(cityId),
      [CACHE_TAG],
    );
  }

  /** Address text to coordinates, through whichever map vendor is configured. */
  async geocode(query: string, near?: LatLng) {
    const results = await this.maps.geocode(query, near);
    return results.slice(0, 10);
  }

  async reverseGeocode(point: LatLng) {
    return this.maps.reverseGeocode(point);
  }

  async autocomplete(query: string, near?: LatLng) {
    return this.maps.autocomplete(query, near);
  }

  // ------------------------------------------------------------------ admin

  async createPlace(input: PlaceInput): Promise<GeoPlace> {
    this.authorize(PERMISSION.GEO_WRITE);
    const place = await this.repository.createPlace(input);
    await this.cache.invalidateByTag(CACHE_TAG);
    return place;
  }

  async createZone(input: ZoneInput): Promise<DeliveryZone> {
    this.authorize(PERMISSION.GEO_WRITE);
    const zone = await this.repository.createZone(input);
    // Zones are cached aggressively, so every write drops the whole geo tag:
    // a stale zone means orders accepted for an address nobody delivers to.
    await this.cache.invalidateByTag(CACHE_TAG);
    return zone;
  }

  async updateZone(id: string, input: ZoneUpdate): Promise<DeliveryZone> {
    this.authorize(PERMISSION.GEO_WRITE);
    const zone = await this.repository.updateZone(id, input);
    await this.cache.invalidateByTag(CACHE_TAG);
    return zone;
  }

  async deleteZone(id: string): Promise<void> {
    this.authorize(PERMISSION.GEO_WRITE);
    await this.repository.deleteZone(id);
    await this.cache.invalidateByTag(CACHE_TAG);
  }

  async listZones(cityId: string): Promise<ZoneWithPolygon[]> {
    return this.zonesFor(cityId);
  }
}
