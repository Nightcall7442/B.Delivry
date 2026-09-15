/**
 * Admin business logic. Tenant settings, feature switches, live monitoring.
 */
import type { Prisma, Tenant } from '@prisma/client';
import { PERMISSION } from '@bazar/constants';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import { NotFoundError } from '../../../common/errors/domain.errors.js';
import { cached, type CacheStore } from '../../../infrastructure/redis/cache.js';
import type { AdminRepository } from '../repository/admin.repository.js';
import type { MonitoringSnapshot, TenantSettings, UpdateSettingsInput } from '../types/index.js';

/**
 * Settings are read on the hot path (every order creation asks whether orders
 * are enabled and whether to auto-confirm), so they are cached and the cache
 * is dropped on every write.
 */
const SETTINGS_TTL_SECONDS = 300;
const SETTINGS_TAG = 'tenant-settings';

export interface AdminServiceDeps extends ServiceDeps {
  repository: AdminRepository;
  cache: CacheStore;
}

export class AdminService extends BaseService {
  private readonly repository: AdminRepository;
  private readonly cache: CacheStore;

  constructor(deps: AdminServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.cache = deps.cache;
  }

  /**
   * Called from the order flow, not only from the admin UI, so it takes the
   * tenant explicitly: a background job has no request context to read.
   */
  async settings(tenantId: string): Promise<TenantSettings> {
    return cached(
      this.cache,
      `settings:${tenantId}`,
      SETTINGS_TTL_SECONDS,
      () => this.repository.settings(tenantId),
      [SETTINGS_TAG],
    );
  }

  async ordersEnabled(tenantId: string): Promise<boolean> {
    return (await this.settings(tenantId)).ordersEnabled;
  }

  async autoConfirm(tenantId: string): Promise<boolean> {
    return (await this.settings(tenantId)).autoConfirmOrders;
  }

  async autoAssign(tenantId: string): Promise<boolean> {
    return (await this.settings(tenantId)).autoAssignCouriers;
  }

  async getSettings(): Promise<TenantSettings> {
    this.authorize(PERMISSION.SETTINGS_WRITE);
    return this.settings(this.tenantId());
  }

  async updateSettings(input: UpdateSettingsInput): Promise<TenantSettings> {
    this.authorize(PERMISSION.SETTINGS_WRITE);
    const updated = await this.repository.updateSettings(this.tenantId(), input);

    // A stale "orders enabled" would keep taking orders after someone pulled
    // the switch, so the cache goes immediately.
    await this.cache.invalidateByTag(SETTINGS_TAG);

    this.logger.warn({ changes: input, actorId: this.currentUser().id }, 'tenant settings changed');
    return updated;
  }

  async tenant() {
    this.authorize(PERMISSION.SETTINGS_WRITE);
    const tenant = await this.repository.tenant(this.tenantId());
    if (tenant === null) throw new NotFoundError('Tenant', this.tenantId());
    return tenant;
  }

  async updateBranding(input: {
    name?: string | undefined;
    branding: Record<string, unknown>;
  }): Promise<Tenant> {
    this.authorize(PERMISSION.SETTINGS_WRITE);
    const updated = await this.repository.updateBranding(this.tenantId(), {
      name: input.name,
      branding: input.branding as Prisma.InputJsonValue,
    });
    await this.cache.invalidateByTag('tenants');
    return updated;
  }

  /** Public: the brand behind a host, the default tenant when the host is unknown. */
  async publicTenant(host: string | undefined) {
    const tenant = await this.repository.publicTenant(host, this.tenantId());
    if (tenant === null) throw new NotFoundError('Tenant', host ?? 'default');
    return tenant;
  }

  /** The operator wall: what needs a human right now. */
  async monitoring(): Promise<MonitoringSnapshot> {
    this.authorize(PERMISSION.ORDER_READ_ANY);
    return this.repository.monitoring();
  }
}
