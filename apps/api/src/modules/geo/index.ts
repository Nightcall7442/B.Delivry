/**
 * Geo module public API. Other modules import ONLY from here (service + types), never from repository.
 */
export { GeoService } from './service/geo.service.js';
export { GeoRepository } from './repository/geo.repository.js';
export { GeoController } from './controller/geo.controller.js';
export { geoRoutes } from './routes/geo.routes.js';
export { PolygonGeofence } from './domain/geofence.js';
export type { ZoneResolution, ZoneWithPolygon } from './types/index.js';
