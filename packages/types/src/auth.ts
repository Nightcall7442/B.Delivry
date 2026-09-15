/**
 * auth types / DTOs.
 */
import type { Locale } from '@bazar/constants';
import type { CurrentUserDto } from './user.js';

export interface RequestOtpDto {
  phone: string;
  locale?: Locale;
}

/** OTP is not echoed back; this is what the client needs to drive the next screen. */
export interface RequestOtpResultDto {
  /** Seconds before a resend is allowed. */
  retryAfter: number;
  expiresIn: number;
  /** Digits to render in the code input. */
  codeLength: number;
}

export interface VerifyOtpDto {
  phone: string;
  code: string;
  /** Ties the session to a device so it can be listed and revoked. */
  deviceId?: string;
  deviceName?: string;
  pushToken?: string;
}

export interface LoginDto {
  phone: string;
  password: string;
  deviceId?: string;
}

export interface RefreshDto {
  refreshToken: string;
}

export interface AuthResultDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: CurrentUserDto;
  /** True on the very first verification: the client shows onboarding. */
  isNewUser: boolean;
}

export interface SessionDto {
  id: string;
  deviceName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}
