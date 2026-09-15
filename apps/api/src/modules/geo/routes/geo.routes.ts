/**
 * Geo route definitions — mounted by src/routes/index.ts.
 */
import { PERMISSION } from '@bazar/constants';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { validate } from '../../../middleware/validation.middleware.js';
import type { GeoController } from '../controller/geo.controller.js';
import {
  deliveryZoneSchema,
  geocodeQuerySchema,
  idParamsSchema,
  placeListQuerySchema,
  resolveZoneQuerySchema,
  updateZoneSchema,
  zoneListQuerySchema,
} from '../schemas/index.js';

export function geoRoutes(controller: GeoController) {
  return async (app: FastifyInstance): Promise<void> => {
    // Reference data is public: the customer app needs the city list before
    // anyone has signed in.
    app.get('/cities', controller.listCities);
    app.get(
      '/places',
      { preHandler: validate({ query: placeListQuerySchema }) },
      controller.listPlaces,
    );
    app.get(
      '/zones/resolve',
      { preHandler: validate({ query: resolveZoneQuerySchema }) },
      controller.resolveZone,
    );

    // Vendor lookups hit a paid API per call, so they need a signed-in caller.
    app.get(
      '/geocode',
      { preHandler: [requireAuth, validate({ query: geocodeQuerySchema })] },
      controller.geocode,
    );
    app.get(
      '/reverse-geocode',
      { preHandler: [requireAuth, validate({ query: resolveZoneQuerySchema })] },
      controller.reverseGeocode,
    );
    app.get(
      '/autocomplete',
      { preHandler: [requireAuth, validate({ query: geocodeQuerySchema })] },
      controller.autocomplete,
    );

    app.get(
      '/zones',
      { preHandler: validate({ query: zoneListQuerySchema }) },
      controller.listZones,
    );

    const adminOnly = [requireAuth, requirePermission(PERMISSION.GEO_WRITE)];

    app.post(
      '/zones',
      { preHandler: [...adminOnly, validate({ body: deliveryZoneSchema })] },
      controller.createZone,
    );
    app.patch(
      '/zones/:id',
      { preHandler: [...adminOnly, validate({ params: idParamsSchema, body: updateZoneSchema })] },
      controller.updateZone,
    );
    app.delete(
      '/zones/:id',
      { preHandler: [...adminOnly, validate({ params: idParamsSchema })] },
      controller.deleteZone,
    );
  };
}
