/**
 * Analytics module-internal types & DTOs.
 */
import type { OrderStatus } from '@bazar/constants';

export type Granularity = 'hour' | 'day' | 'week' | 'month';

export interface AnalyticsQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  cityId?: string | undefined;
  storeId?: string | undefined;
  /** Set by the service for vendor accounts: their stalls only. */
  vendorId?: string | undefined;
  granularity?: Granularity | undefined;
}

export interface DashboardStats {
  ordersToday: number;
  ordersActive: number;
  revenueToday: number;
  averageOrderValue: number;
  couriersOnline: number;
  storesOpen: number;
  /** Share of today's orders that ended CANCELLED or FAILED, 0..1. */
  failureRate: number;
  medianDeliverySeconds: number | null;
  currency: string;
}

export interface TimeSeriesPoint {
  at: string;
  value: number;
}

export interface SalesReport {
  from: Date;
  to: Date;
  orders: number;
  revenue: number;
  commission: number;
  deliveryFees: number;
  discounts: number;
  byStatus: Partial<Record<OrderStatus, number>>;
  series: TimeSeriesPoint[];
  currency: string;
}

export interface TopEntity {
  id: string;
  orders: number;
  revenue: number;
}
