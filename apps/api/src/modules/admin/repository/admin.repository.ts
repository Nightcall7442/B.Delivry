/**
 * Admin persistence (Prisma). Tenant-scoped.
 */
import { ORDER_STATUS, DELIVERY_TIMEOUTS } from '@bazar/constants';
import { compact, startOfLocalDay } from '@bazar/utils';
import type { Prisma, Tenant } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { MonitoringSnapshot, TenantSettings, UpdateSettingsInput } from '../types/index.js';

const DEFAULTS: Omit<TenantSettings, 'tenantId'> = {
  ordersEnabled: true,
  autoConfirmOrders: false,
  autoAssignCouriers: true,
  defaultTariffId: null,
  minAppVersion: null,
  maintenanceMessage: null,
};

export class AdminRepository extends BaseRepository {
  async tenant(tenantId: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id: tenantId } });
  }

  async updateBranding(
    tenantId: string,
    input: { name?: string | undefined; branding: Prisma.InputJsonValue },
  ): Promise<Tenant> {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), branding: input.branding },
    });
  }

  /** The brand of a host — the web server asks with the browser's host header. */
  async publicTenant(host: string | undefined, fallbackTenantId: string): Promise<Tenant | null> {
    const domain = host?.split(':')[0];
    const byDomain =
      domain === undefined || domain.length === 0
        ? null
        : await this.prisma.tenant.findUnique({ where: { domain } });
    return byDomain ?? this.prisma.tenant.findUnique({ where: { id: fallbackTenantId } });
  }

  /** A tenant with no settings row behaves as the defaults, not as broken. */
  async settings(tenantId: string): Promise<TenantSettings> {
    const row = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (row === null) return { tenantId, ...DEFAULTS };

    return {
      tenantId,
      ordersEnabled: row.ordersEnabled,
      autoConfirmOrders: row.autoConfirmOrders,
      autoAssignCouriers: row.autoAssignCouriers,
      defaultTariffId: row.defaultTariffId,
      minAppVersion: row.minAppVersion,
      maintenanceMessage: row.maintenanceMessage,
    };
  }

  async updateSettings(tenantId: string, input: UpdateSettingsInput): Promise<TenantSettings> {
    // Undefined keys are dropped: to Prisma an explicit undefined is a value,
    // and "leave this setting alone" has to be an absent key.
    const patch = compact(input);

    const row = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULTS, ...patch },
      update: patch,
    });

    return {
      tenantId,
      ordersEnabled: row.ordersEnabled,
      autoConfirmOrders: row.autoConfirmOrders,
      autoAssignCouriers: row.autoAssignCouriers,
      defaultTariffId: row.defaultTariffId,
      minAppVersion: row.minAppVersion,
      maintenanceMessage: row.maintenanceMessage,
    };
  }

  /**
   * "Stuck" means an order that has not moved for longer than the whole
   * courier search is allowed to take: by then something needs a person.
   */
  async monitoring(): Promise<MonitoringSnapshot> {
    const stuckBefore = new Date(Date.now() - DELIVERY_TIMEOUTS.COURIER_SEARCH_TTL_SECONDS * 1000);
    const staleBefore = new Date(Date.now() - DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS * 1000);
    const scope = this.tenantScope();

    const [active, searching, stuck, couriers, tickets, failedPayments] = await Promise.all([
      this.prisma.order.count({
        where: { ...scope, status: { notIn: ['DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED'] } },
      }),
      this.prisma.order.count({ where: { ...scope, status: ORDER_STATUS.SEARCHING_COURIER } }),
      this.prisma.order.count({
        where: {
          ...scope,
          status: { in: [ORDER_STATUS.SEARCHING_COURIER, ORDER_STATUS.PENDING] },
          updatedAt: { lt: stuckBefore },
        },
      }),
      this.prisma.courier.count({
        where: { ...scope, status: 'ONLINE', lastLocationAt: { gte: staleBefore } },
      }),
      this.prisma.supportTicket.count({ where: { ...scope, status: { in: ['OPEN', 'PENDING'] } } }),
      this.prisma.payment.count({
        where: { ...scope, status: 'FAILED', createdAt: { gte: startOfLocalDay() } },
      }),
    ]);

    return {
      ordersActive: active,
      ordersSearchingCourier: searching,
      ordersStuck: stuck,
      couriersOnline: couriers,
      openTickets: tickets,
      failedPaymentsToday: failedPayments,
    };
  }
}
