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
    this.assertCanGrant(input.roles);

    if (await this.repository.existsByPhone(input.phone)) {
      throw new ConflictError('A user with this phone already exists');
    }

    const needsPassword = input.roles.some(isStaffRole);
    if (needsPassword && input.password === undefined) {
      throw new ConflictError('Staff accounts require a password');
    }

    const passwordHash = input.password === undefined ? null : await hashPassword(input.password);
    return this.repository.createStaff(input, passwordHash);
  }

  async setRoles(userId: string, roles: Role[]): Promise<UserWithProfiles> {
    this.authorize(PERMISSION.USER_WRITE);
    this.assertCanGrant(roles);

    await this.repository.replaceRoles(userId, roles, this.currentUser().id);
    // Permissions are derived from the token's roles, so the old token would
    // keep the old rights until it expired. Force a re-login instead.
    await this.auth.logoutAll(userId);

    return this.get(userId);
  }

  async block(userId: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.repository.setStatus(userId, 'BLOCKED');
    // Blocking has to take effect now, not when the access token expires.
    await this.auth.logoutAll(userId);
  }

  async unblock(userId: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.repository.setStatus(userId, 'ACTIVE');
  }

  async remove(userId: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.repository.softDelete(userId);
    await this.auth.logoutAll(userId);
  }

  async setPassword(userId: string, password: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.repository.setPassword(userId, await hashPassword(password));
    await this.auth.logoutAll(userId);
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
