/**
 * Catalog HTTP controller — thin: validate → call service → map response.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BaseController } from '../../../common/base/base.controller.js';
import { toProductDto } from '../../../common/dto/index.js';
import { params, query } from '../../../middleware/validation.middleware.js';
import type { AnalyticsService } from '../../analytics/service/analytics.service.js';
import type { CatalogService } from '../service/catalog.service.js';
import type { CatalogSearchQuery } from '../schemas/index.js';

export class CatalogController extends BaseController {
  constructor(
    private readonly service: CatalogService,
    private readonly analytics: AnalyticsService,
  ) {
    super();
  }

  search = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = query<CatalogSearchQuery>(request);
    const result = await this.service.search(input);
    // Demand analytics: a typed search is a wish; zero results is a gap in the catalogue.
    if (input.search) {
      void this.analytics.recordDemand({
        query: input.search,
        results: result.pagination.total,
        source: 'search',
        storeId: input.storeId,
      });
    }
    return this.paginated(reply, { ...result, items: result.items.map(toProductDto) });
  };

  get = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = params<{ id: string }>(request);
    return this.ok(reply, toProductDto(await this.service.get(id)));
  };

  categories = async (request: FastifyRequest, reply: FastifyReply) => {
    const { parentId, root } = query<{ parentId?: string; root?: boolean }>(request);
    // root=true means "top level", which is parentId === null, not undefined.
    return this.ok(reply, await this.service.categories(root === true ? null : parentId));
  };
}
