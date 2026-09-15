/**
 * Users module-internal types & DTOs.
 */
import type { Locale, Role } from '@bazar/constants';

export interface UserListFilters {
  role?: Role | undefined;
  status?: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DELETED' | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CreateStaffInput {
  phone: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | undefined;
  locale?: Locale | undefined;
  roles: Role[];
  password?: string | undefined;
}

export interface UpdateProfileInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | null | undefined;
  locale?: Locale | undefined;
  avatarUrl?: string | null | undefined;
}
