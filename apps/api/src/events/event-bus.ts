/**
 * In-process typed EventBus (publish/subscribe). Swappable for Redis/Kafka when extracting services.
 */
import { randomUUID } from 'node:crypto';
import type { Logger } from '../infrastructure/logger/index.js';
import { getContext } from '../common/tenant/tenant-context.js';
import type { EventName, EventPayloads } from './event-types.js';

export interface DomainEvent<K extends EventName = EventName> {
  id: string;
  name: K;
  payload: EventPayloads[K];
  tenantId: string;
  /** Ties an event back to the request that caused it, across every log line. */
  requestId?: string;
  actorId?: string | null;
  at: Date;
}

export type EventHandler<K extends EventName> = (event: DomainEvent<K>) => Promise<void> | void;

export interface EventBus {
  publish<K extends EventName>(event: DomainEvent<K>): Promise<void>;
  on<K extends EventName>(name: K, handler: EventHandler<K>): void;
}

/**
 * Modules never call each other. Orders publishes OrderStatusChanged;
 * notifications, tracking and audit subscribe. That is what keeps the monolith
 * splittable: replacing this class with a Redis stream changes nothing above it.
 *
 * Handlers are fire-and-forget by design. A failed notification must not roll
 * back a delivered order, so errors are logged, not propagated.
 */
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<EventName, EventHandler<EventName>[]>();

  constructor(private readonly logger: Logger) {}

  on<K extends EventName>(name: K, handler: EventHandler<K>): void {
    const existing = this.handlers.get(name) ?? [];
    existing.push(handler as EventHandler<EventName>);
    this.handlers.set(name, existing);
  }

  async publish<K extends EventName>(event: DomainEvent<K>): Promise<void> {
    const handlers = this.handlers.get(event.name) ?? [];
    this.logger.debug(
      { event: event.name, eventId: event.id, handlers: handlers.length },
      'event published',
    );

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event as DomainEvent<EventName>);
        } catch (error) {
          this.logger.error(
            { err: error, event: event.name, eventId: event.id },
            'event handler failed',
          );
        }
      }),
    );
  }
}

/** Fills in id, tenant and request metadata from the ambient context. */
export function createEvent<K extends EventName>(
  name: K,
  payload: EventPayloads[K],
  overrides: Partial<Pick<DomainEvent<K>, 'tenantId' | 'actorId'>> = {},
): DomainEvent<K> {
  const context = getContext();
  const tenantId = overrides.tenantId ?? context?.tenantId;
  if (tenantId === undefined) {
    throw new Error(`Cannot publish ${name}: no tenant in context and none provided`);
  }

  return {
    id: randomUUID(),
    name,
    payload,
    tenantId,
    ...(context?.requestId !== undefined ? { requestId: context.requestId } : {}),
    actorId: overrides.actorId ?? context?.user?.id ?? null,
    at: new Date(),
  };
}
