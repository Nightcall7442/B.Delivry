/**
 * Cron-like schedulers (repeatable jobs).
 */
import type { JobQueue } from '../../infrastructure/redis/queue.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { JOB, QUEUE } from '../queues.js';

/**
 * Repeatable jobs, registered on every boot. BullMQ keys them by a stable
 * jobId, so restarting the process does not stack up duplicate schedules.
 *
 * Cron expressions are evaluated in Asia/Tashkent (set in the queue), which is
 * what makes "the daily report" land after the local day actually ends.
 */
export async function registerSchedulers(
  queue: JobQueue,
  tenantId: string,
  logger: Logger,
): Promise<void> {
  const today = (): string => new Date().toISOString().slice(0, 10);

  // Hourly: sweep whatever has expired. Cheap, bounded, safe to miss.
  await queue.schedule(QUEUE.MAINTENANCE, JOB.CLEANUP, { target: 'carts' }, '0 * * * *');
  await queue.schedule(QUEUE.MAINTENANCE, JOB.CLEANUP, { target: 'otps' }, '15 * * * *');
  await queue.schedule(QUEUE.MAINTENANCE, JOB.CLEANUP, { target: 'sessions' }, '30 3 * * *');

  // Location history is the largest table by far; pruned nightly, off-peak.
  await queue.schedule(QUEUE.MAINTENANCE, JOB.CLEANUP, { target: 'locations' }, '0 4 * * *');

  // Just after local midnight, so the day being reported on is complete.
  await queue.schedule(
    QUEUE.ANALYTICS,
    JOB.ANALYTICS_SNAPSHOT,
    { tenantId, date: today() },
    '10 0 * * *',
  );
  await queue.schedule(
    QUEUE.ANALYTICS,
    JOB.DAILY_REPORTS,
    { tenantId, date: today() },
    '30 0 * * *',
  );

  // Subscriptions place their orders two hours before the slot; a five-minute
  // tick keeps that within a few minutes of the mark.
  await queue.schedule(QUEUE.MAINTENANCE, JOB.RUN_SUBSCRIPTIONS, { tenantId }, '*/5 * * * *');

  // Cashback burns at dawn, before anyone spends what they no longer have.
  await queue.schedule(QUEUE.MAINTENANCE, JOB.EXPIRE_CASHBACK, { tenantId }, '0 5 * * *');

  logger.info('schedulers registered');
}
