/**
 * Auth module-internal types & DTOs.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import type { Locale, Role } from '@bazar/constants';

export interface OtpChallenge {
  /** Seconds before a resend is allowed. */
  retryAfter: number;
  expiresIn: number;
  codeLength: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
  isNewUser: boolean;
}

export interface DeviceInfo {
  deviceId?: string | undefined;
  deviceName?: string | undefined;
  ip?: string | null;
  userAgent?: string | null;
  pushToken?: string | undefined;
}

/** Everything needed to build a principal, loaded in one query. */
export interface UserWithRoles {
  id: string;
  tenantId: string;
  phone: string;
  locale: string;
  status: string;
  passwordHash: string | null;
  failedLogins: number;
  lockedUntil: Date | null;
  roles: Role[];
  customerId: string | null;
  courierId: string | null;
  vendorId: string | null;
  extraPermissions: string[];
}

export interface CreateUserInput {
  tenantId: string;
  phone: string;
  locale: Locale;
  roles: Role[];
}

export interface SessionRecord {
  id: string;
  userId: string;
  version: number;
  expiresAt: Date;
  revokedAt: Date | null;
}
