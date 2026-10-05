/**
 * «Подешевело»: a good someone saved went on sale, and they hear it once a day at most —
 *   product.sale_started → a promo notification to every customer whose heart is on it
 * Marketing, so a customer who opted out of promos gets nothing (NotificationsService decides).
 */
import { TEMPLATE } from '@bazar/notifications';
import { runWithContext } from '../../common/tenant/tenant-context.js';
import { systemContext } from '../../common/types/request-context.js';
import type { JobQueue } from '../../infrastructure/redis/queue.js';
import { JOB, QUEUE } from '../../jobs/queues.js';
import type { FavoritesService } from '../../modules/favorites/service/favorites.service.js';
import { PRODUCT_EVENT } from '../../modules/products/domain/product.events.js';
import type { EventBus } from '../event-bus.js';

export interface FavoritesSaleDeps {
  favorites: Pick<FavoritesService, 'saversOf'>;
  queue: JobQueue;
}

const sum = (minor: number) => `${(minor / 100).toLocaleString('ru-RU')} сум`;
const ENQUEUE_BATCH = 100;

export function registerFavoritesSaleHandlers(events: EventBus, deps: FavoritesSaleDeps): void {
  events.on(PRODUCT_EVENT.SALE_STARTED, async (event) => {
    const { productId, name, price, oldPrice, imageUrl } = event.payload;
    const savers = await runWithContext(
      systemContext(event.tenantId, `sale:${event.id}`, 'ru'),
      () => deps.favorites.saversOf(productId),
    );
    if (savers.length === 0) return;
    const title = `Подешевело: ${name['ru'] ?? Object.values(name)[0] ?? ''}`;
    const percent = Math.round((1 - price / oldPrice) * 100);
    // Tashkent's date: a second cut the same day is not a second push.
    const day = new Date(event.at.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
    const tell = (customerId: string) => {
      const key = `sale:${productId}:${day}:${customerId}`;
      return deps.queue.enqueue(
        QUEUE.NOTIFICATIONS,
        JOB.SEND_NOTIFICATION,
        {
          tenantId: event.tenantId,
          userId: customerId,
          template: TEMPLATE.PROMO,
          params: {
            title,
            body: `${sum(price)} вместо ${sum(oldPrice)} (−${percent} %) — у вас в избранном`,
          },
          deepLink: `/product/${productId}`,
          ...(imageUrl !== null ? { imageUrl } : {}),
          idempotencyKey: key,
        },
        { jobId: key },
      );
    };
    // The seller's request waits for this: in batches, not one round trip per saver.
    for (let i = 0; i < savers.length; i += ENQUEUE_BATCH) {
      await Promise.all(savers.slice(i, i + ENQUEUE_BATCH).map(tell));
    }
  });
}
