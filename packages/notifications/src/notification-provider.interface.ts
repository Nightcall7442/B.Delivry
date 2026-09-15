/**
 * NotificationProvider interface: send(message), channel, supports().
 */
import type { NotificationChannel } from '@bazar/constants';
import type { DeliveryReport, NotificationMessage, RenderedMessage } from './types.js';

/**
 * One implementation per channel (push/sms/telegram/email/in-app). The service
 * renders the template, then hands the result to whichever provider can deliver it.
 */
export interface NotificationProvider {
  readonly channel: NotificationChannel;

  /** False when the recipient lacks what this channel needs (no push token, no chat id). */
  supports(message: NotificationMessage): boolean;

  send(message: NotificationMessage, rendered: RenderedMessage): Promise<DeliveryReport>;
}
