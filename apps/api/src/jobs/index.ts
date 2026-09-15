/**
 * Jobs barrel: registers queues & workers on boot.
 */
import type { Container } from '../app/container.js';
import { JOB, type JobName, type JobPayloads } from './queues.js';
import { analyticsSnapshotJob } from './workers/analytics.job.js';
import { cleanupJob } from './workers/cleanup.job.js';
import { findCourierJob } from './workers/find-courier.job.js';
import { processPaymentJob } from './workers/process-payment.job.js';
import { dailyReportsJob } from './workers/reports.job.js';
import { expireCashbackJob } from './workers/expire-cashback.job.js';
import { runSubscriptionsJob } from './workers/run-subscriptions.job.js';
import { sendNotificationJob } from './workers/send-notification.job.js';
import { persistLocationsJob } from './workers/tracking.job.js';
import { updateEtaJob } from './workers/update-eta.job.js';

export * from './queues.js';
export { registerSchedulers } from './schedulers/index.js';

export type JobHandler = (payload: never) => Promise<void>;

/**
 * The full map of job name to handler. Used by the worker process to build
 * BullMQ workers, and by the inline queue so a Redis-less dev run still
 * exercises the same code.
 */
export function buildJobHandlers(
  container: Container,
): Map<JobName, (payload: never) => Promise<void>> {
  const handlers = new Map<JobName, (payload: never) => Promise<void>>();

  const register = <K extends JobName>(
    name: K,
    handler: (payload: JobPayloads[K]) => Promise<void>,
  ): void => {
    handlers.set(name, handler as (payload: never) => Promise<void>);
  };

  register(JOB.FIND_COURIER, findCourierJob(container));
  register(JOB.UPDATE_ETA, updateEtaJob(container));
  register(JOB.SEND_NOTIFICATION, sendNotificationJob(container));
  register(JOB.PROCESS_PAYMENT, processPaymentJob(container));
  register(JOB.PERSIST_LOCATIONS, persistLocationsJob(container));
  register(JOB.CLEANUP, cleanupJob(container));
  register(JOB.ANALYTICS_SNAPSHOT, analyticsSnapshotJob(container));
  register(JOB.DAILY_REPORTS, dailyReportsJob(container));
  register(JOB.RUN_SUBSCRIPTIONS, runSubscriptionsJob(container));
  register(JOB.EXPIRE_CASHBACK, expireCashbackJob(container));

  return handlers;
}
