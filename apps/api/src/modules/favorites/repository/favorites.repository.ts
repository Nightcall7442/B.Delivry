/**
 * Favorites persistence (Prisma). Tenant-scoped.
 */
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { FavoriteIds, FavoriteKind } from '../types/index.js';

const column = (kind: FavoriteKind) => (kind === 'product' ? 'productId' : 'storeId');

export class FavoritesRepository extends BaseRepository {
  async list(customerId: string): Promise<FavoriteIds> {
    const rows = await this.prisma.favorite.findMany({
      where: this.scoped({ customerId }),
      select: { productId: true, storeId: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      productIds: rows.flatMap((row) => (row.productId === null ? [] : [row.productId])),
      storeIds: rows.flatMap((row) => (row.storeId === null ? [] : [row.storeId])),
    };
  }

  async has(customerId: string, kind: FavoriteKind, targetId: string): Promise<boolean> {
    const found = await this.prisma.favorite.count({
      where: this.scoped({ customerId, [column(kind)]: targetId }),
    });
    return found > 0;
  }

  count(customerId: string, kind: FavoriteKind): Promise<number> {
    return this.prisma.favorite.count({
      where: this.scoped({ customerId, [column(kind)]: { not: null } }),
    });
  }

  /** Saving what is already saved changes nothing: the unique pair answers the race, not a read. */
  async add(customerId: string, kind: FavoriteKind, targetId: string): Promise<void> {
    await this.prisma.favorite.createMany({
      data: [{ ...this.tenantScope(), customerId, [column(kind)]: targetId }],
      skipDuplicates: true,
    });
  }

  /** Who saved this good, at most `limit` of them: the audience of «подешевело». */
  async saversOf(productId: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.favorite.findMany({
      where: this.scoped({ productId }),
      select: { customerId: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => row.customerId);
  }

  async remove(customerId: string, kind: FavoriteKind, targetId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({
      where: this.scoped({ customerId, [column(kind)]: targetId }),
    });
  }
}
