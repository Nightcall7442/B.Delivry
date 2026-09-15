/**
 * Queue names & job payload types (typed).
 */
import type { NotificationChannel } from '@bazar/constants';
import type { TemplateKey } from '@bazar/notifications';

/** Separate queues so a flood of location pings cannot starve payments. */
export const QUEUE = {
  DELIVERY: 'delivery',
  NOTIFICATIONS: 'notifications',
  PAYMENTS: 'payments',
  TRACKING: 'tracking',
  MAINTENANCE: 'maintenance',
  ANALYTICS: 'analytics',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export const JOB = {
  FIND_COURIER: 'find-courier',
  UPDATE_ETA: 'update-eta',
  SEND_NOTIFICATION: 'send-notification',
  PROCESS_PAYMENT: 'process-payment',
  PERSIST_LOCATIONS: 'persist-locations',
  CLEANUP: 'cleanup',
  ANALYTICS_SNAPSHOT: 'analytics-snapshot',
  DAILY_REPORTS: 'daily-reports',
  RUN_SUBSCRIPTIONS: 'run-subscriptions',
  EXPIRE_CASHBACK: 'expire-cashback',
} as const;

export type JobName = (typeof JOB)[keyof typeof JOB];

/** Every payload carries its tenant: a worker has no request to read it from. */
interface TenantJob {
  tenantId: string;
}

export interface FindCourierJob extends TenantJob {
  orderId: string;
  /** Widens on each attempt until COURIER_MAX_METERS. */
  radiusMeters: number;
  attempt: number;
}

export type RunSubscriptionsJob = TenantJob;
export type ExpireCashbackJob = TenantJob;

export interface UpdateEtaJob extends TenantJob {
  orderId: string;
}

export interface SendNotificationJob extends TenantJob {
  userId: string;
  template: TemplateKey;
  params: Record<string, string | number>;
  channel?: NotificationChannel;
  orderId?: string;
  deepLink?: string;
  imageUrl?: string;
  idempotencyKey?: string;
}

export interface ProcessPaymentJob extends TenantJob {
  paymentId: string;
  action: 'capture' | 'verify' | 'refund';
  amount?: number;
  reason?: string;
}

export interface PersistLocationsJob extends TenantJob {
  courierId: string;
  points: {
    lat: number;
    lng: number;
    heading?: number;
    speedKmh?: number;
    accuracyMeters?: number;
    recordedAt: string;
    orderId?: string;
  }[];
}

export interface CleanupJob {
  /** Which sweep to run; they share a queue but not a schedule. */
  target: 'carts' | 'otps' | 'sessions' | 'locations';
}

export interface AnalyticsSnapshotJob extends TenantJob {
  /** ISO date of the local day being aggregated. */
  date: string;
}

export interface DailyReportsJob extends TenantJob {
  date: string;
}

/** Maps a job name to its payload, so enqueue sites cannot send the wrong shape. */
export interface JobPayloads {
  'find-courier': FindCourierJob;
  'update-eta': UpdateEtaJob;
  'send-notification': SendNotificationJob;
  'process-payment': ProcessPaymentJob;
  'persist-locations': PersistLocationsJob;
  cleanup: CleanupJob;
  'analytics-snapshot': AnalyticsSnapshotJob;
  'daily-reports': DailyReportsJob;
  'run-subscriptions': RunSubscriptionsJob;
  'expire-cashback': ExpireCashbackJob;
}

/** Which queue each job runs on. */
export const JOB_QUEUE: Record<JobName, QueueName> = {
  'find-courier': QUEUE.DELIVERY,
  'update-eta': QUEUE.DELIVERY,
  'send-notification': QUEUE.NOTIFICATIONS,
  'process-payment': QUEUE.PAYMENTS,
  'persist-locations': QUEUE.TRACKING,
  cleanup: QUEUE.MAINTENANCE,
  'analytics-snapshot': QUEUE.ANALYTICS,
  'daily-reports': QUEUE.ANALYTICS,
  'run-subscriptions': QUEUE.MAINTENANCE,
  'expire-cashback': QUEUE.MAINTENANCE,
};
