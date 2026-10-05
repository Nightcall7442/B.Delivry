/**
 * What a heart on a good is for — each heard once a day at most, by every customer whose heart is
 * on it:
 *   product.sale_started   → «Подешевело»
 *   product.back_in_stock  → «Снова в наличии»
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

/** Tashkent's date: a second cut, or a second refill, the same day is not a second push. */
const tashkentDay = (at: Date) => new Date(at.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
const nameOf = (name: Record<string, string>) => name['ru'] ?? Object.values(name)[0] ?? '';

export function registerFavoritesSaleHandlers(events: EventBus, deps: FavoritesSaleDeps): void {
  /** One promo to every saver of the good, keyed `${kind}:${productId}:${day}:${customer}`. */
  const tellSavers = async (
    event: { id: string; tenantId: string; at: Date },
    kind: 'sale' | 'back',
    product: { productId: string; imageUrl: string | null },
    params: { title: string; body: string },
  ) => {
    const savers = await runWithContext(
      systemContext(event.tenantId, `${kind}:${event.id}`, 'ru'),
      () => deps.favorites.saversOf(product.productId),
    );
    const day = tashkentDay(event.at);
    const tell = (customerId: string) => {
      const key = `${kind}:${product.productId}:${day}:${customerId}`;
      return deps.queue.enqueue(
        QUEUE.NOTIFICATIONS,
        JOB.SEND_NOTIFICATION,
        {
          tenantId: event.tenantId,
          userId: customerId,
          template: TEMPLATE.PROMO,
          params,
          deepLink: `/product/${product.productId}`,
          ...(product.imageUrl !== null ? { imageUrl: product.imageUrl } : {}),
          idempotencyKey: key,
        },
        { jobId: key },
      );
    };
    // The seller's request waits for this: in batches, not one round trip per saver.
    for (let i = 0; i < savers.length; i += ENQUEUE_BATCH) {
      await Promise.all(savers.slice(i, i + ENQUEUE_BATCH).map(tell));
    }
  };

  events.on(PRODUCT_EVENT.SALE_STARTED, async (event) => {
    const { name, price, oldPrice } = event.payload;
    const percent = Math.round((1 - price / oldPrice) * 100);
    await tellSavers(event, 'sale', event.payload, {
      title: `Подешевело: ${nameOf(name)}`,
      body: `${sum(price)} вместо ${sum(oldPrice)} (−${percent} %) — у вас в избранном`,
    });
  });

  events.on(PRODUCT_EVENT.BACK_IN_STOCK, async (event) => {
    const { name, price } = event.payload;
    await tellSavers(event, 'back', event.payload, {
      title: `Снова в наличии: ${nameOf(name)}`,
      body: `${sum(price)} — у вас в избранном, можно заказать`,
    });
  });
}
