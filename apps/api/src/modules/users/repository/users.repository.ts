/**
 * Users persistence (Prisma). Tenant-scoped.
 */
import type { Role } from '@bazar/constants';
import type { Prisma, User } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CreateStaffInput, UpdateProfileInput, UserListFilters } from '../types/index.js';

const USER_INCLUDE = {
  roles: { select: { role: true } },
  customer: { select: { id: true, plusUntil: true, referralCode: true } },
  courier: { select: { id: true } },
  vendor: { select: { id: true } },
} satisfies Prisma.UserInclude;

export type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

export class UsersRepository extends BaseRepository {
  async findById(id: string): Promise<UserWithProfiles | null> {
    return this.prisma.user.findFirst({
      where: this.scopedAlive({ id }),
      include: USER_INCLUDE,
    });
  }

  async list(filters: UserListFilters): Promise<PaginatedResult<UserWithProfiles>> {
    const where: Prisma.UserWhereInput = {
      ...this.tenantScope(),
      deletedAt: null,
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.role !== undefined ? { roles: { some: { role: filters.role } } } : {}),
      // Staff look people up by phone or by name, and rarely know which.
      ...(filters.search !== undefined
        ? {
            OR: [
              { phone: { contains: filters.search } },
              { firstName: { contains: filters.search, mode: 'insensitive' as const } },
              { lastName: { contains: filters.search, mode: 'insensitive' as const } },
              { email: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    return this.page(
      filters,
      (page) =>
        this.prisma.user.findMany({
          where,
          include: USER_INCLUDE,
          orderBy: { createdAt: 'desc' },
          ...page,
        }),
      () => this.prisma.user.count({ where }),
    );
  }

  async createStaff(
    input: CreateStaffInput,
    passwordHash: string | null,
  ): Promise<UserWithProfiles> {
    return this.prisma.user.create({
      data: {
        tenantId: this.tenantScope().tenantId,
        phone: input.phone,
        email: input.email ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        locale: input.locale ?? 'uz',
        passwordHash,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        roles: { create: input.roles.map((role) => ({ role })) },
      },
      include: USER_INCLUDE,
    });
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<UserWithProfiles> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      },
      include: USER_INCLUDE,
    });
  }

  async setStatus(
    id: string,
    status: NonNullable<Prisma.UserUpdateInput['status']>,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { status } });
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  /** Replaces the whole role set, so removing a role is one call, not two. */
  async replaceRoles(userId: string, roles: Role[], grantedBy: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.createMany({
        data: roles.map((role) => ({ userId, role, grantedBy })),
      }),
    ]);
  }

  /** Soft delete: orders, reviews and audit rows still point at this user. */
  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });
  }

  async existsByPhone(phone: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: this.scoped({ phone, deletedAt: null }) });
    return count > 0;
  }
}
