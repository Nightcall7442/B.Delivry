/**
 * Users business logic. Profiles, staff accounts, roles, blocking.
 */
import { effectivePermissions } from '@bazar/auth';
import { PERMISSION, isStaffRole, type Role } from '@bazar/constants';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { AuthService } from '../../auth/service/auth.service.js';
import { hashPassword } from '../../auth/guards/index.js';
import { assertMayManageAccount } from '../domain/account-rank.js';
import type { UsersRepository, UserWithProfiles } from '../repository/users.repository.js';
import type { CreateStaffInput, UpdateProfileInput, UserListFilters } from '../types/index.js';

export interface UsersServiceDeps extends ServiceDeps {
  repository: UsersRepository;
  auth: AuthService;
}

export class UsersService extends BaseService {
  private readonly repository: UsersRepository;
  private readonly auth: AuthService;

  constructor(deps: UsersServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.auth = deps.auth;
  }

  /** The caller's own profile, plus everything the UI needs to gate itself. */
  async me(): Promise<UserWithProfiles & { permissions: string[] }> {
    const user = this.currentUser();
    const row = await this.repository.findById(user.id);
    if (row === null) throw new NotFoundError('User', user.id);

    return {
      ...row,
      permissions: effectivePermissions(row.roles.map((entry) => entry.role as Role)),
    };
  }

  async updateProfile(input: UpdateProfileInput): Promise<UserWithProfiles> {
    return this.repository.updateProfile(this.currentUser().id, input);
  }

  async list(filters: UserListFilters): Promise<PaginatedResult<UserWithProfiles>> {
    this.authorize(PERMISSION.USER_READ);
    return this.repository.list(filters);
  }

  async get(id: string): Promise<UserWithProfiles> {
    this.authorize(PERMISSION.USER_READ);
    const user = await this.repository.findById(id);
    if (user === null) throw new NotFoundError('User', id);
    return user;
  }

  /**
   * Staff accounts get a password; everyone else signs in with an OTP. Creating
   * one is a privileged act, so the roles being granted are checked against
   * what the caller may grant.
   */
  async createStaff(input: CreateStaffInput): Promise<UserWithProfiles> {
    this.authorize(PERMISSION.USER_WRITE);
    const roles = [...new Set(input.roles)];
    this.assertCanGrant(roles);

    if (await this.repository.existsByPhone(input.phone)) {
      throw new ConflictError('A user with this phone already exists');
    }

    const needsPassword = roles.some(isStaffRole);
    if (needsPassword && input.password === undefined) {
      throw new ConflictError('Staff accounts require a password');
    }

    const passwordHash = input.password === undefined ? null : await hashPassword(input.password);
    return this.repository.createStaff({ ...input, roles }, passwordHash, this.currentUser().id);
  }

  async setRoles(userId: string, roles: Role[]): Promise<UserWithProfiles> {
    this.authorize(PERMISSION.USER_WRITE);
    const next = [...new Set(roles)];
    this.assertCanGrant(next);
    const target = await this.manageable(userId);

    // Replacing the set is how a role is taken away, so one may not replace one's own with fewer:
    // a SUPER_ADMIN stripping themselves would leave the tenant without anyone who can undo it.
    if (
      target.id === this.currentUser().id &&
      target.roles.some((entry) => !next.includes(entry.role as Role))
    ) {
      throw new ForbiddenError('You cannot take roles away from your own account');
    }

    await this.repository.replaceRoles(userId, next, this.currentUser().id);
    // Permissions are derived from the token's roles, so the old token would
    // keep the old rights until it expired. Force a re-login instead.
    await this.auth.logoutAll(userId);

    return this.get(userId);
  }

  async block(userId: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    const target = await this.manageable(userId);
    this.refuseSelf(target, 'block');
    await this.repository.setStatus(userId, 'BLOCKED');
    // Blocking has to take effect now, not when the access token expires.
    await this.auth.logoutAll(userId);
  }

  async unblock(userId: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    const target = await this.manageable(userId);
    // Only a block is lifted: this must not switch on a PENDING account nobody has verified.
    if (target.status !== 'BLOCKED') return;
    await this.repository.setStatus(userId, 'ACTIVE');
  }

  async remove(userId: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    const target = await this.manageable(userId);
    this.refuseSelf(target, 'delete');
    await this.repository.softDelete(userId);
    await this.auth.logoutAll(userId);
  }

  async setPassword(userId: string, password: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.manageable(userId);
    await this.repository.setPassword(userId, await hashPassword(password));
    await this.auth.logoutAll(userId);
  }

  /**
   * The account an action is aimed at, inside the caller's tenant (another tenant's id is a 404) and
   * within the caller's rank: `user:write` is every ADMIN's, and without this an ADMIN could set the
   * password of a SUPER_ADMIN, or block or demote a peer. See assertMayManageAccount.
   */
  private async manageable(userId: string): Promise<UserWithProfiles> {
    const target = await this.repository.findById(userId);
    if (target === null) throw new NotFoundError('User', userId);
    assertMayManageAccount(
      this.context(),
      target.id,
      target.roles.map((entry) => entry.role as Role),
    );
    return target;
  }

  /** Locking oneself out is never what the desk meant: someone else has to do it. */
  private refuseSelf(target: UserWithProfiles, verb: string): void {
    if (target.id === this.currentUser().id) {
      throw new ForbiddenError(`You cannot ${verb} your own account`);
    }
  }

  /**
   * Nobody may grant a role they do not themselves hold. Without this an
   * ADMIN could promote an account to SUPER_ADMIN and escalate sideways.
   */
  private assertCanGrant(roles: readonly Role[]): void {
    const granter = this.currentUser();
    if (granter.roles.includes('SUPER_ADMIN')) return;

    const beyond = roles.filter((role) => !granter.roles.includes(role));
    if (beyond.length > 0) {
      throw new ForbiddenError(`Cannot grant roles you do not hold: ${beyond.join(', ')}`);
    }
  }
}
