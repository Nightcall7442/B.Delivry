/**
 * Prometheus metrics registry + business metrics (orders_created_total, ...).
 */
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'bazar_' });

export const httpRequestDuration = new Histogram({
  name: 'bazar_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  // Route template, never the raw path: /orders/:id, not /orders/<uuid>, or
  // the cardinality explodes with one series per order.
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

export const ordersCreated = new Counter({
  name: 'bazar_orders_created_total',
  help: 'Orders created',
  labelNames: ['city', 'payment_method'] as const,
  registers: [registry],
});

export const orderStatusChanges = new Counter({
  name: 'bazar_order_status_changes_total',
  help: 'Order status transitions',
  labelNames: ['from', 'to'] as const,
  registers: [registry],
});

export const ordersFailed = new Counter({
  name: 'bazar_orders_failed_total',
  help: 'Orders that ended in FAILED or CANCELLED',
  labelNames: ['status', 'reason'] as const,
  registers: [registry],
});

/** How long the automatic search takes; the alert that matters at rush hour. */
export const courierSearchDuration = new Histogram({
  name: 'bazar_courier_search_duration_seconds',
  help: 'Time from search start to a courier accepting',
  buckets: [5, 15, 30, 60, 120, 300, 600],
  registers: [registry],
});

export const courierSearchFailed = new Counter({
  name: 'bazar_courier_search_failed_total',
  help: 'Searches that found nobody before the timeout',
  registers: [registry],
});

export const couriersOnline = new Gauge({
  name: 'bazar_couriers_online',
  help: 'Couriers currently online',
  labelNames: ['city'] as const,
  registers: [registry],
});

export const deliveryDuration = new Histogram({
  name: 'bazar_delivery_duration_seconds',
  help: 'Time from courier assignment to delivery',
  buckets: [300, 600, 900, 1800, 3600, 7200],
  registers: [registry],
});

export const paymentsTotal = new Counter({
  name: 'bazar_payments_total',
  help: 'Payment attempts by provider and result',
  labelNames: ['provider', 'method', 'status'] as const,
  registers: [registry],
});

export const notificationsSent = new Counter({
  name: 'bazar_notifications_sent_total',
  help: 'Notifications handed to a provider',
  labelNames: ['channel', 'status'] as const,
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: 'bazar_job_duration_seconds',
  help: 'Background job duration',
  labelNames: ['queue', 'name', 'result'] as const,
  buckets: [0.1, 0.5, 1, 5, 15, 60],
  registers: [registry],
});

export const websocketConnections = new Gauge({
  name: 'bazar_websocket_connections',
  help: 'Open websocket connections on this instance',
  registers: [registry],
});

export const providerErrors = new Counter({
  name: 'bazar_provider_errors_total',
  help: 'Upstream provider failures',
  labelNames: ['provider', 'operation'] as const,
  registers: [registry],
});

export const metricsContentType = registry.contentType;

export const renderMetrics = (): Promise<string> => registry.metrics();
