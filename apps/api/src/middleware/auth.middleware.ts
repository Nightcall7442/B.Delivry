/**
 * Parse & verify JWT / session → req.user.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ERROR_CODE } from '../common/errors/error-codes.js';
import { UnauthorizedError } from '../common/errors/domain.errors.js';

export interface TokenVerifier {
  /** Resolves the principal, or throws UnauthorizedError with a precise code. */
  verifyAccessToken(token: string): Promise<AuthenticatedUser>;
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header === undefined) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token.length === 0) return null;
  return token;
}

/**
 * Optional by design: this hook only populates `request.user` when a valid
 * token is present. Requiring authentication is the route's decision, made
 * with `requireAuth` below, because plenty of endpoints are public.
 *
 * An invalid token is still an error, though. Silently treating a rejected
 * token as anonymous is how expired sessions turn into confusing empty lists
 * instead of a clean 401 the client can refresh on.
 */
export function registerAuth(app: FastifyInstance, verifier: TokenVerifier): void {
  app.addHook('onRequest', async (request) => {
    const token = bearerToken(request);
    if (token === null) return;
    request.user = await verifier.verifyAccessToken(token);
  });
}

/** Route-level guard: `preHandler: [requireAuth]`. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (request.user === undefined || request.user === null) {
    throw new UnauthorizedError('Authentication required', ERROR_CODE.UNAUTHORIZED);
  }
}
