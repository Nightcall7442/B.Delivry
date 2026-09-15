/**
 * Abstract service base (logger, event publisher).
 */
import type { Permission } from '@bazar/constants';
import { can, type ResourceRef } from '@bazar/auth';
import type { EventBus, DomainEvent } from '../../events/event-bus.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { requireContext } from '../tenant/tenant-context.js';
import type { RequestContext } from '../types/request-context.js';

export interface ServiceDeps {
  logger: Logger;
  events: EventBus;
}

/**
 * Services hold the business rules. They read the caller from the ambient
 * request context, authorize with the same `can()` the admin UI uses, and
 * publish domain events instead of calling other modules directly.
 */
export abstract class BaseService {
  protected readonly logger: Logger;
  protected readonly events: EventBus;

  constructor(deps: ServiceDeps) {
    this.logger = deps.logger;
    this.events = deps.events;
  }

  protected context(): RequestContext {
    return requireContext();
  }

  protected tenantId(): string {
    return this.context().tenantId;
  }

  /** Throws 401 on anonymous callers, so services never see a null user. */
  protected currentUser() {
    const user = this.context().user;
    if (user === null) throw new UnauthorizedError();
    return user;
  }

  /**
   * The one authorization call. `resource` carries the owner ids of the record
   * being touched; omit it only for genuinely unscoped actions.
   */
  protected authorize(permission: Permission, resource?: ResourceRef): void {
    // Jobs run as the platform itself: no user, every permission.
    if (this.context().system === true) return;
    const user = this.currentUser();
    if (!can(user, permission, resource)) {
      throw new ForbiddenError(`Missing permission: ${permission}`, {
        meta: { permission, userId: user.id },
      });
    }
  }

  /**
   * Publish after the write has committed. Handlers send notifications and
   * enqueue jobs, and there is no undoing an SMS if the transaction rolls back.
   */
  protected async publish(event: DomainEvent): Promise<void> {
    await this.events.publish(event);
  }
}
