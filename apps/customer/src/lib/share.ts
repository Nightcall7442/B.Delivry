/**
 * «Поделиться»: a good or a stall goes to a friend as a line of text with the site's link — the
 * stall's page opens in any browser, the app or not. The system sheet decides where it goes.
 */
import { Share } from 'react-native';

export const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'http://localhost:3000';

export const stallUrl = (locale: string, storeId: string): string =>
  `${WEB_URL}/${locale}/stores/${storeId}`;

/** The line, then the link on its own line (Android's sheet takes one message). Dismissing it is not an error. */
export function shareLink(text: string, url: string): void {
  void Share.share({ message: `${text}\n${url}` }).catch(() => undefined);
}
