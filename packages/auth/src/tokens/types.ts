/**
 * JWT payload shape (sub, roles, tenantId, sessionId).
 */
import type { Role } from '@bazar/constants';

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  roles: Role[];
  tenantId: string;
  sessionId: string;
  /** Actor ids, so "own resource" checks work without a lookup. */
  courierId?: string;
  vendorId?: string;
  customerId?: string;
  /** Issued-at / expiry, seconds since epoch (set by the signer). */
  iat?: number;
  exp?: number;
}

/**
 * Refresh tokens carry nothing but their identity: rotating one must invalidate
 * the whole family if it is replayed, so the state lives in the session store.
 */
export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  /** Rotation counter; a reused older value means the token was stolen. */
  version: number;
  tenantId: string;
  iat?: number;
  exp?: number;
}

export type TokenType = 'access' | 'refresh';
