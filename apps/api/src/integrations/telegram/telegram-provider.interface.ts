/**
 * TelegramProvider contract: sendMessage, webhook handling.
 */
export interface TelegramMessage {
  chatId: string;
  text: string;
  /** Telegram accepts a small HTML subset; used for order numbers in bold. */
  parseMode?: 'HTML' | 'MarkdownV2';
  disableNotification?: boolean;
  /** One row of inline URL buttons under the message. */
  buttons?: { text: string; url: string }[];
  /** A one-time reply keyboard; `requestContact` asks Telegram for the person's own number. */
  keyboard?: { text: string; requestContact?: boolean }[];
  /** Takes a reply keyboard away again once it did its job. */
  removeKeyboard?: boolean;
}

export interface TelegramResult {
  sent: boolean;
  messageId: number | null;
  failureReason?: string;
}

export interface TelegramProvider {
  readonly id: string;
  sendMessage(message: TelegramMessage): Promise<TelegramResult>;
  /** Points the bot at our webhook; called once at deploy time. */
  setWebhook(url: string, secret: string): Promise<boolean>;
}
