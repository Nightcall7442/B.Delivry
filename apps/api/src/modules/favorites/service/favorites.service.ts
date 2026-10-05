/**
 * «Избранное»: the hearts on a good and on a stall. A customer saves only what they may see — a
 * stall in review or a good of a suspended vendor is NotFound here as everywhere else — and the
 * list is ids alone: the storefront reads the goods and stalls through its usual, filtered calls,
 * so a heart saved before a stall was hidden shows nothing rather than leaking it.
 */
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { ConflictError, ForbiddenError } from '../../../common/errors/domain.errors.js';
import type { CatalogService } from '../../catalog/service/catalog.service.js';
import type { StoresService } from '../../stores/service/stores.service.js';
import type { FavoritesRepository } from '../repository/favorites.repository.js';
import type { FavoriteIds, FavoriteKind } from '../types/index.js';

export interface FavoritesServiceDeps extends ServiceDeps {
  repository: FavoritesRepository;
  catalog: Pick<CatalogService, 'get'>;
  stores: Pick<StoresService, 'getVisible'>;
}

/** Per kind. A list longer than this is not a list anybody scrolls; it is a script. */
export const MAX_FAVORITES = 300;
/** One sale tells at most this many savers: a push storm is not a feature. */
const MAX_SALE_AUDIENCE = 1_000;

export class FavoritesService extends BaseService {
  private readonly repository: FavoritesRepository;
  private readonly catalog: Pick<CatalogService, 'get'>;
  private readonly stores: Pick<StoresService, 'getVisible'>;

  constructor(deps: FavoritesServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.catalog = deps.catalog;
    this.stores = deps.stores;
  }

  list(): Promise<FavoriteIds> {
    return this.repository.list(this.callerCustomerId());
  }

  async add(kind: FavoriteKind, targetId: string): Promise<void> {
    const customerId = this.callerCustomerId();
    // Throws NotFound for what this caller may not see, the same answer as for what does not exist.
    if (kind === 'product') await this.catalog.get(targetId);
    else await this.stores.getVisible(targetId);
    if ((await this.repository.count(customerId, kind)) >= MAX_FAVORITES) {
      throw new ConflictError(`At most ${MAX_FAVORITES} saved ${kind}s`);
    }
    await this.repository.add(customerId, kind, targetId);
  }

  /** The customers who saved a good, newest hearts first. The platform's own read (a job, an event). */
  saversOf(productId: string): Promise<string[]> {
    return this.repository.saversOf(productId, MAX_SALE_AUDIENCE);
  }

  /** No check of the target: a heart on a good that has since gone must still come off. */
  async remove(kind: FavoriteKind, targetId: string): Promise<void> {
    await this.repository.remove(this.callerCustomerId(), kind, targetId);
  }

  private callerCustomerId(): string {
    const customerId = this.currentUser().customerId;
    if (customerId === undefined) throw new ForbiddenError('Customer profile required');
    return customerId;
  }
}
