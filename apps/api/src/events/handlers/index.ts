/**
 * Registers cross-module event handlers.
 */
import type { RealtimePublisher } from '../../infrastructure/redis/realtime-events.js';
import type { JobQueue } from '../../infrastructure/redis/queue.js';
import type { AuditWriter } from '../../modules/audit/types/index.js';
import type { DeliveryService } from '../../modules/delivery/service/delivery.service.js';
import type { EventBus } from '../event-bus.js';
import { registerAuditHandlers } from './audit.handler.js';
import { registerCourierSearchHandlers } from './order-courier-search.handler.js';
import {
  registerOrderNotificationHandlers,
  type RecipientDeps,
} from './order-notifications.handler.js';
import { registerOrderRealtimeHandlers } from './order-realtime.handler.js';
import { registerCustomerPerksHandlers, type PerksDeps } from './customer-perks.handler.js';
import { registerOrderGuaranteeHandlers, type GuaranteeDeps } from './order-guarantee.handler.js';
import { registerOrderPaymentHandlers, type PaymentSyncDeps } from './order-payment.handler.js';
import { registerOrderStatsHandlers, type StatsDeps } from './order-stats.handler.js';

export interface EventHandlerDeps {
  events: EventBus;
  queue: JobQueue;
  realtime: RealtimePublisher;
  audit: AuditWriter;
  autoAssign: (tenantId: string) => Promise<boolean>;
  stats: StatsDeps;
  paymentSync: PaymentSyncDeps;
  guarantee: GuaranteeDeps;
  perks: PerksDeps;
  recipient: RecipientDeps;
  delivery: DeliveryService;
}

/**
 * Called once at boot, after the container is built. This is the whole map of
 * what reacts to what: read this file to know why an SMS was sent.
 */
export function registerEventHandlers(deps: EventHandlerDeps): void {
  registerOrderRealtimeHandlers(deps.events, deps.realtime);
  registerOrderNotificationHandlers(deps.events, deps.queue, deps.recipient);
  registerCourierSearchHandlers(deps.events, {
    queue: deps.queue,
    autoAssign: deps.autoAssign,
    orders: deps.guarantee.orders,
    delivery: deps.delivery,
  });
  registerAuditHandlers(deps.events, deps.audit);
  registerOrderStatsHandlers(deps.events, deps.stats);
  registerOrderPaymentHandlers(deps.events, deps.paymentSync);
  registerOrderGuaranteeHandlers(deps.events, deps.guarantee);
  registerCustomerPerksHandlers(deps.events, deps.perks);
}
