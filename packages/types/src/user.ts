/**
 * user types / DTOs.
 */
import type { Locale, Permission, Role } from '@bazar/constants';
import type { Id, TenantEntity } from './common.js';

export const USER_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  DELETED: 'DELETED',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export interface UserDto extends TenantEntity {
  /** Canonical +998XXXXXXXXX. The login identity: unique per tenant. */
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  locale: Locale;
  status: UserStatus;
  roles: Role[];
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
}

/** What /users/me returns: the profile plus everything the UI needs to gate itself. */
export interface CurrentUserDto extends UserDto {
  permissions: Permission[];
  customerId: Id | null;
  courierId: Id | null;
  vendorId: Id | null;
  /** A Telegram chat is bound to this account: order updates go there too. */
  telegramLinked: boolean;
  /** Bazar Plus is active until this moment; null = never bought. */
  plusUntil: string | null;
  /** The code this customer shares; null for staff accounts. */
  referralCode: string | null;
}

export interface UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  locale?: Locale;
  avatarUrl?: string | null;
}

export interface UserListQuery {
  role?: Role;
  status?: UserStatus;
  search?: string;
}
