/**
 * analytics types / DTOs.
 */
import type { OrderStatus } from '@bazar/constants';
import type { Id, MoneyDto } from './common.js';

/** The operator dashboard header. Cheap to compute, refreshed often. */
export interface DashboardStatsDto {
  ordersToday: number;
  ordersActive: number;
  revenueToday: MoneyDto;
  averageOrderValue: MoneyDto;
  couriersOnline: number;
  couriersBusy: number;
  storesOpen: number;
  /** Share of today's orders that ended CANCELLED or FAILED, 0..1. */
  failureRate: number;
  /** Seconds from CONFIRMED to DELIVERED, median over today. */
  medianDeliverySeconds: number | null;
}

export interface TimeSeriesPointDto {
  /** Bucket start, ISO. Granularity comes from the query. */
  at: string;
  value: number;
}

export interface SalesReportDto {
  range: { from: string; to: string };
  orders: number;
  revenue: MoneyDto;
  commission: MoneyDto;
  deliveryFees: MoneyDto;
  discounts: MoneyDto;
  byStatus: Record<OrderStatus, number>;
  series: TimeSeriesPointDto[];
}

export interface TopEntityDto {
  id: Id;
  name: string;
  orders: number;
  revenue: MoneyDto;
}

export interface AnalyticsQuery {
  from?: string;
  to?: string;
  cityId?: Id;
  storeId?: Id;
  granularity?: 'hour' | 'day' | 'week' | 'month';
}

export interface CourierPerformanceDto {
  courierId: Id;
  name: string;
  deliveries: number;
  cancellations: number;
  rating: number;
  /** Seconds, median. */
  medianDeliverySeconds: number | null;
  earnings: MoneyDto;
}

/** Demand: what people looked for, and the queries the catalogue could not answer. */
export interface DemandRowDto {
  query: string;
  count: number;
  /** Results the last time it was asked; 0 = nothing in the catalogue. */
  results: number;
}

export interface DemandReportDto {
  top: DemandRowDto[];
  unmet: DemandRowDto[];
}
