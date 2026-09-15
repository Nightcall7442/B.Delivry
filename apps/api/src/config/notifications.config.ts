/**
 * Notifications configuration slice.
 */
import type { Env } from './env.schema.js';

export interface NotificationsConfig {
  sms: {
    provider: Env['SMS_PROVIDER'];
    eskiz?: { email: string; password: string; from: string };
    playmobile?: { login: string; password: string };
  };
  push: {
    provider: Env['PUSH_PROVIDER'];
    expoAccessToken?: string;
    fcm?: { projectId: string; clientEmail: string; privateKey: string };
  };
  email: {
    provider: Env['EMAIL_PROVIDER'];
    from: string;
    smtp?: { host: string; port: number; user?: string; password?: string };
  };
  telegram: {
    botToken?: string;
    botUsername?: string;
    webhookSecret?: string;
    supportChatId?: string;
    /** Where "open order" buttons point. */
    webUrl: string;
  };
}

export function buildNotificationsConfig(env: Env): NotificationsConfig {
  return {
    sms: {
      provider: env.SMS_PROVIDER,
      ...(env.ESKIZ_EMAIL !== undefined && env.ESKIZ_PASSWORD !== undefined
        ? { eskiz: { email: env.ESKIZ_EMAIL, password: env.ESKIZ_PASSWORD, from: env.ESKIZ_FROM } }
        : {}),
      ...(env.PLAYMOBILE_LOGIN !== undefined && env.PLAYMOBILE_PASSWORD !== undefined
        ? { playmobile: { login: env.PLAYMOBILE_LOGIN, password: env.PLAYMOBILE_PASSWORD } }
        : {}),
    },
    push: {
      provider: env.PUSH_PROVIDER,
      ...(env.EXPO_ACCESS_TOKEN !== undefined ? { expoAccessToken: env.EXPO_ACCESS_TOKEN } : {}),
      ...(env.FCM_PROJECT_ID !== undefined &&
      env.FCM_CLIENT_EMAIL !== undefined &&
      env.FCM_PRIVATE_KEY !== undefined
        ? {
            fcm: {
              projectId: env.FCM_PROJECT_ID,
              clientEmail: env.FCM_CLIENT_EMAIL,
              // Env files cannot hold real newlines: restore them for the PEM.
              privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
          }
        : {}),
    },
    email: {
      provider: env.EMAIL_PROVIDER,
      from: env.EMAIL_FROM,
      ...(env.SMTP_HOST !== undefined
        ? {
            smtp: {
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              ...(env.SMTP_USER !== undefined ? { user: env.SMTP_USER } : {}),
              ...(env.SMTP_PASSWORD !== undefined ? { password: env.SMTP_PASSWORD } : {}),
            },
          }
        : {}),
    },
    telegram: {
      webUrl: env.WEB_URL,
      ...(env.TELEGRAM_BOT_TOKEN !== undefined ? { botToken: env.TELEGRAM_BOT_TOKEN } : {}),
      ...(env.TELEGRAM_BOT_USERNAME !== undefined
        ? { botUsername: env.TELEGRAM_BOT_USERNAME }
        : {}),
      ...(env.TELEGRAM_WEBHOOK_SECRET !== undefined
        ? { webhookSecret: env.TELEGRAM_WEBHOOK_SECRET }
        : {}),
      ...(env.TELEGRAM_SUPPORT_CHAT_ID !== undefined
        ? { supportChatId: env.TELEGRAM_SUPPORT_CHAT_ID }
        : {}),
    },
  };
}
