/**
 * Which failed queue jobs are worth an error report.
 */
import type { Job } from 'bullmq';
import { reportError, type ErrorReporter } from '../infrastructure/telemetry/error-reporting.js';

/**
 * True once BullMQ will not run the job again. `failed` fires after every attempt, and most
 * failures are a provider having a bad minute that the next retry fixes: those are logged, not
 * reported.
 *
 * `finishedOn` is set only when the job moved to the failed set, which also covers an
 * UnrecoverableError and `job.discard()`, where attempts were left over. The count is the
 * fallback for a job object that does not carry it.
 */
export function hasExhaustedAttempts(
  job: Pick<Job, 'attemptsMade' | 'opts' | 'finishedOn'>,
): boolean {
  return job.finishedOn != null || job.attemptsMade >= (job.opts?.attempts ?? 1);
}

/**
 * Reports a job that failed for good: the queue, the job's name and how many attempts it had.
 * Never its data: a job payload is an order, an address, a phone number.
 */
export function reportJobFailure(
  queue: string,
  jobName: string,
  attempts: number,
  error: unknown,
  reporter?: ErrorReporter,
): void {
  reportError(error, { tags: { source: 'job', queue, job: jobName, attempts } }, reporter);
}

/** A BullMQ `failed` event: reported only if the job will not be run again. */
export function reportFailedJob(
  queue: string,
  job: Pick<Job, 'name' | 'attemptsMade' | 'opts' | 'finishedOn'> | undefined,
  error: unknown,
  reporter?: ErrorReporter,
): void {
  if (job === undefined || !hasExhaustedAttempts(job)) return;
  reportJobFailure(queue, job.name, job.attemptsMade, error, reporter);
}
