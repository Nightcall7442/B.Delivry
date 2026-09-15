/**
 * Auth shared types.
 */
import type { Locale, Permission, Role } from '@bazar/constants';

/**
 * The authenticated principal, as reconstructed from the access token.
 * Everything the RBAC layer needs is here: no DB round-trip to authorize.
 */
export interface AuthenticatedUser {
  id: string;
  roles: Role[];
  permissions: Permission[];
  tenantId: string;
  sessionId: string;
  locale: Locale;
  phone?: string;
  /** Set when the user acts as a courier / vendor: scopes "own resource" checks. */
  courierId?: string;
  vendorId?: string;
  customerId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
}

export type AuthFactor = 'otp' | 'password';
