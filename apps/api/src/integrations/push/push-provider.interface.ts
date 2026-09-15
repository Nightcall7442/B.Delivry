/**
 * PushProvider contract: send(tokens, payload), invalidateToken.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  deepLink?: string;
  /** A picture of the stall this morning: what makes "сезон начался" land. */
  imageUrl?: string;
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  /** Tokens the provider rejected as gone: stop trying them. */
  invalidTokens: string[];
  failureReason?: string;
}

export interface PushProvider {
  readonly id: string;
  send(tokens: string[], payload: PushPayload): Promise<PushResult>;
}
