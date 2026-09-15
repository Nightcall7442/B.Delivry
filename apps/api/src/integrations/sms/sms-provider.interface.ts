/**
 * SmsProvider contract: send(to:+998..., text), deliveryStatus.
 */
export interface SmsResult {
  accepted: boolean;
  /** Provider message id, for matching delivery reports later. */
  externalId: string | null;
  failureReason?: string;
}

export interface SmsProvider {
  readonly id: string;
  /** `to` is always the canonical +998XXXXXXXXX form. */
  send(to: string, text: string): Promise<SmsResult>;
  deliveryStatus(externalId: string): Promise<'sent' | 'delivered' | 'failed' | 'unknown'>;
}
