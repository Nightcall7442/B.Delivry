/**
 * PAYMENT_METHOD: CASH | CARD | ONLINE | BALANCE; PAYMENT_STATUS.
 */
export const PAYMENT_METHOD = {
  CASH: 'CASH',
  CARD: 'CARD',
  ONLINE: 'ONLINE',
  BALANCE: 'BALANCE',
  /** B2B: bank transfer within the customer's credit days. */
  INVOICE: 'INVOICE',
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  PAYMENT_STATUS.CAPTURED,
  PAYMENT_STATUS.FAILED,
  PAYMENT_STATUS.CANCELLED,
  PAYMENT_STATUS.REFUNDED,
];

/** Cash is settled by the courier on handover: no provider call, captured on delivery. */
export const OFFLINE_PAYMENT_METHODS: readonly PaymentMethod[] = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.INVOICE,
];

export const PAYMENT_PROVIDER = {
  CASH: 'cash',
  PAYME: 'payme',
  CLICK: 'click',
  UZUM: 'uzum',
  BALANCE: 'balance',
} as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];

/** What a payment is for. Orders are the rule; the rest are the platform's own products. */
export const PAYMENT_PURPOSE = {
  ORDER: 'ORDER',
  PLUS: 'PLUS',
  TIP: 'TIP',
  PROMO: 'PROMO',
} as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSE)[keyof typeof PAYMENT_PURPOSE];
