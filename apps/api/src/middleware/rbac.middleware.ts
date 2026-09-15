/**
 * Role / permission checks (uses @bazar/auth rbac definitions).
 */
import { can } from '@bazar/auth';
import type { Permission, Role } from '@bazar/constants';
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../common/errors/domain.errors.js';

function principal(request: FastifyRequest) {
  if (request.user === undefined || request.user === null) throw new UnauthorizedError();
  return request.user;
}

/**
 * Coarse gate at the route. It answers "may this kind of user call this
 * endpoint at all", never "may they touch this particular order" — that check
 * needs the record, so it lives in the service where the record is loaded.
 */
export function requirePermission(...permissions: Permission[]): preHandlerHookHandler {
  return async (request) => {
    const user = principal(request);
    const granted = permissions.some((permission) => can(user, permission));
    if (!granted) {
      throw new ForbiddenError(`Missing permission: ${permissions.join(' or ')}`, {
        meta: { userId: user.id, permissions },
      });
    }
  };
}

export function requireRole(...roles: Role[]): preHandlerHookHandler {
  return async (request) => {
    const user = principal(request);
    if (!roles.some((role) => user.roles.includes(role))) {
      throw new ForbiddenError(`Requires role: ${roles.join(' or ')}`, {
        meta: { userId: user.id, roles },
      });
    }
  };
}

/** Endpoints only a courier account may reach (offers, location pings). */
export const requireCourier: preHandlerHookHandler = async (request) => {
  const user = principal(request);
  if (user.courierId === undefined) {
    throw new ForbiddenError('Courier profile required');
  }
};

export const requireVendor: preHandlerHookHandler = async (request) => {
  const user = principal(request);
  if (user.vendorId === undefined) {
    throw new ForbiddenError('Vendor profile required');
  }
};

export const requireCustomer: preHandlerHookHandler = async (request) => {
  const user = principal(request);
  if (user.customerId === undefined) {
    throw new ForbiddenError('Customer profile required');
  }
};
