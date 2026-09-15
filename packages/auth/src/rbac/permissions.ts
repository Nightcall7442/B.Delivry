/**
 * Permission helpers.
 */
import type { Permission, Role } from '@bazar/constants';
import { permissionsForRoles } from './roles.js';

/**
 * A permission ending in `_any` is the unscoped twin of its base permission:
 * `order:read` means "orders you own", `order:read_any` means "anyone's orders".
 * That pairing is what lets one check cover both customers and operators.
 */
export const ANY_SUFFIX = '_any';

export const anyVariantOf = (permission: Permission): string => `${permission}${ANY_SUFFIX}`;

export const isAnyPermission = (permission: string): boolean => permission.endsWith(ANY_SUFFIX);

export function hasPermission(granted: readonly Permission[], permission: Permission): boolean {
  return granted.includes(permission);
}

export const hasAnyPermission = (
  granted: readonly Permission[],
  permissions: readonly Permission[],
): boolean => permissions.some((permission) => granted.includes(permission));

export const hasAllPermissions = (
  granted: readonly Permission[],
  permissions: readonly Permission[],
): boolean => permissions.every((permission) => granted.includes(permission));

/** Effective permissions for a set of roles, plus any granted to the user directly. */
export function effectivePermissions(
  roles: readonly Role[],
  extra: readonly Permission[] = [],
): Permission[] {
  return [...new Set([...permissionsForRoles(roles), ...extra])];
}
