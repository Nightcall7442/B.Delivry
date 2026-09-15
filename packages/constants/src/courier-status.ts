/**
 * Courier statuses: OFFLINE | ONLINE | BUSY | SUSPENDED.
 */
export const COURIER_STATUS = {
  OFFLINE: 'OFFLINE',
  ONLINE: 'ONLINE',
  BUSY: 'BUSY',
  SUSPENDED: 'SUSPENDED',
} as const;

export type CourierStatus = (typeof COURIER_STATUS)[keyof typeof COURIER_STATUS];

/** Only these statuses may receive a delivery offer. */
export const ASSIGNABLE_COURIER_STATUSES: readonly CourierStatus[] = [COURIER_STATUS.ONLINE];
