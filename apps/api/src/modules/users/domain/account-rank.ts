/**
 * Who may act on whose account.
 *
 * The permission matrix says what a role may do, never to whom: `user:write` belongs to every
 * ADMIN, so on its own it lets an ADMIN set a SUPER_ADMIN's password and sign in as them. Anything
 * that blocks, suspends, re-roles or re-credentials an account asks this first.
 */
import type { AuthenticatedUser } from '@bazar/auth';
import { PERMISSION, ROLE, type Role } from '@bazar/constants';
import { ForbiddenError } from '../../../common/errors/domain.errors.js';
import { requireUser, type RequestContext } from '../../../common/types/request-context.js';

/** The desk (operators, admins) is told apart by the one unscoped permission, order:read_any. */
export const isDesk = (user: AuthenticatedUser): boolean =>
  user.permissions.includes(PERMISSION.ORDER_READ_ANY);

/** Jobs act as the platform; a person at the desk is `isDesk`; a token without a profile id is neither. */
export const isDeskContext = (context: RequestContext): boolean =>
  context.system === true || (context.user !== null && isDesk(context.user));

/** The roles that sit above the desk's own: only a SUPER_ADMIN may change those accounts. */
const ABOVE_ADMIN: readonly Role[] = [ROLE.SUPER_ADMIN, ROLE.ADMIN];

/**
 * Throws unless the caller may act on an account that holds `targetRoles`. A SUPER_ADMIN may act on
 * anyone; an ADMIN may manage OPERATOR, VENDOR, COURIER, CUSTOMER and role-less accounts, but not a
 * peer ADMIN or a SUPER_ADMIN. Acting on oneself is not outranking oneself, so `targetUserId` equal
 * to the caller passes (what a person may do to their own account is each endpoint's own rule).
 */
export function assertMayManageAccount(
  context: RequestContext,
  targetUserId: string,
  targetRoles: readonly Role[],
): void {
  if (context.system === true) return;
  const caller = requireUser(context);
  if (caller.id === targetUserId) return;
  if (caller.roles.includes(ROLE.SUPER_ADMIN)) return;

  if (targetRoles.some((role) => ABOVE_ADMIN.includes(role))) {
    throw new ForbiddenError('Only a super admin may change an admin account', {
      meta: { userId: caller.id, targetUserId },
    });
  }
}
