/**
 * can(user, permission, resource?) — pure function, usable on server & client.
 */
import { ROLE, type Permission } from '@bazar/constants';
import type { AuthenticatedUser } from '../types.js';
import { anyVariantOf } from './permissions.js';

/**
 * Who a record belongs to. Repositories return these ids on every row that a
 * non-staff user could reach, so authorization never needs a second query.
 */
export interface ResourceRef {
  tenantId?: string;
  userId?: string;
  customerId?: string;
  courierId?: string;
  vendorId?: string;
}

/** True when this user is one of the parties on the record. */
export function owns(user: AuthenticatedUser, resource: ResourceRef): boolean {
  return (
    (resource.userId !== undefined && resource.userId === user.id) ||
    (resource.customerId !== undefined && resource.customerId === user.customerId) ||
    (resource.courierId !== undefined && resource.courierId === user.courierId) ||
    (resource.vendorId !== undefined && resource.vendorId === user.vendorId)
  );
}

/**
 * The single authorization rule for the whole platform.
 *
 * 1. The permission must be granted by the roles the user holds.
 * 2. Cross-tenant access is refused for everyone but SUPER_ADMIN.
 * 3. When a concrete resource is named, the user must either own it or hold the
 *    unscoped `_any` twin of the permission (which is what operators get).
 *
 * Deliberately pure: the admin UI hides buttons with the same call the API
 * authorizes with, so the two can never drift apart.
 */
export function can(
  user: AuthenticatedUser,
  permission: Permission,
  resource?: ResourceRef,
): boolean {
  if (!user.permissions.includes(permission)) return false;

  const isSuperAdmin = user.roles.includes(ROLE.SUPER_ADMIN);

  if (resource?.tenantId !== undefined && resource.tenantId !== user.tenantId && !isSuperAdmin) {
    return false;
  }

  if (resource === undefined) return true;
  if (isSuperAdmin) return true;

  const unscoped = anyVariantOf(permission);
  if ((user.permissions as readonly string[]).includes(unscoped)) return true;

  return owns(user, resource);
}

/** Throwing variant for call sites that treat denial as an error. */
export function assertCan(
  user: AuthenticatedUser,
  permission: Permission,
  resource?: ResourceRef,
): void {
  if (!can(user, permission, resource)) {
    throw new Error(`Forbidden: ${permission}`);
  }
}
