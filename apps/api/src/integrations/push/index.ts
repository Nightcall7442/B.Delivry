/**
 * PushProvider factory.
 */
import type { NotificationsConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { ExpoPushProvider } from './providers/expo.provider.js';
import { FcmPushProvider } from './providers/fcm.provider.js';
import type { PushProvider } from './push-provider.interface.js';

export * from './push-provider.interface.js';

export function createPushProvider(config: NotificationsConfig, logger: Logger): PushProvider {
  const push = config.push;

  if (push.provider === 'fcm' && push.fcm !== undefined) {
    return new FcmPushProvider(push.fcm, logger);
  }

  // Expo is the default: the customer and courier apps are Expo builds.
  return new ExpoPushProvider(logger, push.expoAccessToken);
}
