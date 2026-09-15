/**
 * Addresses persistence (Prisma). Tenant-scoped.
 */
import type { Address, Prisma } from '@prisma/client';
import { BaseRepository } from '../../../common/base/base.repository.js';
import type { AddressInput } from '../types/index.js';

export class AddressesRepository extends BaseRepository {
  async listForCustomer(customerId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: this.scoped({ customerId, deletedAt: null }),
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findById(id: string, customerId?: string): Promise<Address | null> {
    return this.prisma.address.findFirst({
      where: this.scoped({
        id,
        deletedAt: null,
        ...(customerId !== undefined ? { customerId } : {}),
      }),
    });
  }

  async countForCustomer(customerId: string): Promise<number> {
    return this.prisma.address.count({ where: this.scoped({ customerId, deletedAt: null }) });
  }

  async create(customerId: string, input: AddressInput): Promise<Address> {
    return this.prisma.$transaction(async (tx) => {
      // Exactly one default per customer, enforced by clearing the others first.
      if (input.isDefault === true) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }

      const isFirst = (await tx.address.count({ where: { customerId, deletedAt: null } })) === 0;

      return tx.address.create({
        data: {
          tenantId: this.tenantScope().tenantId,
          customerId,
          label: input.label ?? 'HOME',
          title: input.title ?? null,
          cityId: input.cityId,
          districtId: input.districtId ?? null,
          mahallaId: input.mahallaId ?? null,
          street: input.street ?? null,
          house: input.house ?? null,
          apartment: input.apartment ?? null,
          entrance: input.entrance ?? null,
          floor: input.floor ?? null,
          intercom: input.intercom ?? null,
          landmark: input.landmark ?? null,
          instructions: input.instructions ?? null,
          lat: input.point?.lat ?? null,
          lng: input.point?.lng ?? null,
          // The first address a customer saves is their default by definition.
          isDefault: input.isDefault === true || isFirst,
        },
      });
    });
  }

  async update(id: string, input: Partial<AddressInput>): Promise<Address> {
    const data: Prisma.AddressUpdateInput = {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.street !== undefined ? { street: input.street } : {}),
      ...(input.house !== undefined ? { house: input.house } : {}),
      ...(input.apartment !== undefined ? { apartment: input.apartment } : {}),
      ...(input.entrance !== undefined ? { entrance: input.entrance } : {}),
      ...(input.floor !== undefined ? { floor: input.floor } : {}),
      ...(input.intercom !== undefined ? { intercom: input.intercom } : {}),
      ...(input.landmark !== undefined ? { landmark: input.landmark } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.point !== undefined ? { lat: input.point.lat, lng: input.point.lng } : {}),
    };
    return this.prisma.address.update({ where: { id }, data });
  }

  async setDefault(customerId: string, id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  /** Soft delete: past orders keep their frozen copy, but the list stays clean. */
  async softDelete(id: string): Promise<void> {
    await this.prisma.address.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  async findDefault(customerId: string): Promise<Address | null> {
    return this.prisma.address.findFirst({
      where: this.scoped({ customerId, deletedAt: null, isDefault: true }),
    });
  }
}
