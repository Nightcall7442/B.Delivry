/**
 * Orders persistence (Prisma). Tenant-scoped.
 */
import {
  ACTIVE_ORDER_STATUSES,
  type OrderStatus,
  type PaymentMethod,
  type SubstitutionPolicy,
} from '@bazar/constants';
import type { Order, Prisma } from '@prisma/client';
import { BaseRepository, type PrismaTransaction } from '../../../common/base/base.repository.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { FrozenAddress, OrderListFilters, OrderTotals, PricedItem } from '../types/index.js';

/** What a caller almost always wants alongside the order itself. */
const ORDER_INCLUDE = {
  items: true,
  store: {
    select: {
      id: true,
      vendorId: true,
      name: true,
      type: true,
      status: true,
      rating: true,
      logoUrl: true,
      phone: true,
      standNumber: true,
      address: true,
      // The courier is sent here, so the pickup point travels with the order.
      lat: true,
      lng: true,
    },
  },
  statusHistory: { orderBy: { at: 'asc' } },
  delivery: { select: { id: true, status: true, courierId: true, etaAt: true } },
  customer: {
    select: { id: true, userId: true, user: { select: { firstName: true, phone: true } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

export interface CreateOrderData {
  tenantId: string;
  number: string;
  customerId: string;
  storeId: string;
  items: PricedItem[];
  totals: OrderTotals;
  address: FrozenAddress;
  paymentMethod: PaymentMethod;
  comment: string | null;
  vendorComment: string | null;
  substitutionPolicy: SubstitutionPolicy;
  scheduledFor: Date | null;
  promisedAt: Date | null;
  addressId: string;
  courierFee: number;
  couponId: string | null;
  currency: string;
  recipientName: string | null;
  recipientPhone: string | null;
  groupId: string | null;
  dueAt: Date | null;
}

export class OrdersRepository extends BaseRepository {
  /**
   * Creates the order, its frozen item snapshot and the first history row in
   * one transaction: an order without items, or without a history entry, is a
   * broken record that later code has to defend against forever.
   */
  async create(data: CreateOrderData, tx?: PrismaTransaction): Promise<OrderWithRelations> {
    return this.client(tx).order.create({
      data: {
        tenantId: data.tenantId,
        number: data.number,
        customerId: data.customerId,
        storeId: data.storeId,
        subtotal: data.totals.subtotal.amount,
        deliveryFee: data.totals.deliveryFee.amount,
        serviceFee: data.totals.serviceFee.amount,
        discount: data.totals.discount.amount,
        total: data.totals.total.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        comment: data.comment,
        vendorComment: data.vendorComment,
        substitutionPolicy: data.substitutionPolicy,
        scheduledFor: data.scheduledFor,
        promisedAt: data.promisedAt,
        addressId: data.addressId,
        courierFee: data.courierFee,
        couponId: data.couponId,
        recipientName: data.recipientName,
        recipientPhone: data.recipientPhone,
        groupId: data.groupId,
        dueAt: data.dueAt,
        addressCityId: data.address.cityId,
        addressFormatted: data.address.formatted,
        addressStreet: data.address.street,
        addressHouse: data.address.house,
        addressApartment: data.address.apartment,
        addressEntrance: data.address.entrance,
        addressFloor: data.address.floor,
        addressLandmark: data.address.landmark,
        addressInstructions: data.address.instructions,
        addressLat: data.address.lat,
        addressLng: data.address.lng,
        items: {
          create: data.items.map((item) => ({
            productId: item.productId,
            name: item.name as Prisma.InputJsonValue,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice.amount,
            total: item.total.amount,
            currency: item.total.currency,
            comment: item.comment,
          })),
        },
        statusHistory: { create: { status: 'PENDING', actorId: null, comment: null } },
      },
      include: ORDER_INCLUDE,
    });
  }

  async findById(id: string, tx?: PrismaTransaction): Promise<OrderWithRelations | null> {
    return this.client(tx).order.findFirst({
      where: this.scoped({ id }),
      include: ORDER_INCLUDE,
    });
  }

  async findByNumber(number: string): Promise<OrderWithRelations | null> {
    return this.prisma.order.findFirst({
      where: this.scoped({ number }),
      include: ORDER_INCLUDE,
    });
  }

  /**
   * Writes the new status and its history row together, guarded by the status
   * it is moving from. If another request already moved the order, the update
   * matches nothing and returns null instead of overwriting a newer state.
   */
  async applyStatus(
    id: string,
    from: OrderStatus,
    to: OrderStatus,
    actorId: string | null,
    comment: string | null,
    tx?: PrismaTransaction,
  ): Promise<Order | null> {
    const client = this.client(tx);

    const result = await client.order.updateMany({
      where: { id, status: from },
      data: {
        status: to,
        ...(to === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
        ...(to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        ...(to === 'CANCELLED' ? { cancelledAt: new Date(), cancelReason: comment } : {}),
      },
    });

    if (result.count === 0) return null;

    await client.orderStatusHistory.create({
      data: { orderId: id, status: to, actorId, comment },
    });

    return client.order.findUnique({ where: { id } });
  }

  /** Open B2B credit: invoices not yet paid, cancelled orders excluded. */
  async unpaidInvoiceTotal(customerId: string): Promise<number> {
    const result = await this.prisma.order.aggregate({
      where: {
        customerId,
        paymentMethod: 'INVOICE',
        paymentStatus: { not: 'CAPTURED' },
        status: { notIn: ['CANCELLED', 'FAILED'] },
      },
      _sum: { total: true },
    });
    return result._sum.total ?? 0;
  }

  /** Sibling orders of a cross-bazaar group. */
  async findGroup(groupId: string): Promise<OrderWithRelations[]> {
    return this.prisma.order.findMany({
      where: { ...this.tenantScope(), groupId },
      include: ORDER_INCLUDE,
      orderBy: { placedAt: 'asc' },
    });
  }

  async list(filters: OrderListFilters): Promise<PaginatedResult<OrderWithRelations>> {
    const where = this.buildWhere(filters);
    return this.page(
      filters,
      (page) =>
        this.prisma.order.findMany({
          where,
          include: ORDER_INCLUDE,
          orderBy: { placedAt: 'desc' },
          ...page,
        }),
      () => this.prisma.order.count({ where }),
    );
  }

  private buildWhere(filters: OrderListFilters): Prisma.OrderWhereInput {
    const status =
      filters.activeOnly === true
        ? { in: [...ACTIVE_ORDER_STATUSES] }
        : Array.isArray(filters.status)
          ? { in: filters.status }
          : filters.status;

    return {
      ...this.tenantScope(),
      ...(status !== undefined ? { status } : {}),
      ...(filters.customerId !== undefined ? { customerId: filters.customerId } : {}),
      ...(filters.courierId !== undefined ? { courierId: filters.courierId } : {}),
      ...(filters.storeId !== undefined ? { storeId: filters.storeId } : {}),
      ...(filters.vendorId !== undefined ? { store: { vendorId: filters.vendorId } } : {}),
      ...(filters.cityId !== undefined ? { addressCityId: filters.cityId } : {}),
      ...(filters.paymentMethod !== undefined ? { paymentMethod: filters.paymentMethod } : {}),
      ...(filters.paymentStatus !== undefined ? { paymentStatus: filters.paymentStatus } : {}),
      ...(filters.from !== undefined || filters.to !== undefined
        ? {
            placedAt: {
              ...(filters.from !== undefined ? { gte: filters.from } : {}),
              ...(filters.to !== undefined ? { lte: filters.to } : {}),
            },
          }
        : {}),
      // Operators search by the number the customer reads out over the phone.
      ...(filters.search !== undefined
        ? { number: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
    };
  }

  async assignCourier(id: string, courierId: string, tx?: PrismaTransaction): Promise<void> {
    await this.client(tx).order.update({ where: { id }, data: { courierId } });
  }

  async releaseCourier(id: string, tx?: PrismaTransaction): Promise<void> {
    await this.client(tx).order.update({ where: { id }, data: { courierId: null } });
  }

  async setEta(id: string, etaAt: Date | null): Promise<void> {
    await this.prisma.order.update({ where: { id }, data: { etaAt } });
  }

  async setPaymentStatus(
    id: string,
    paymentStatus: NonNullable<Prisma.OrderUpdateInput['paymentStatus']>,
  ): Promise<void> {
    await this.prisma.order.update({ where: { id }, data: { paymentStatus } });
  }

  /**
   * Reprices weighed items against what the courier actually bought, and
   * rewrites the order totals in the same transaction.
   */
  async applyActualQuantities(
    orderId: string,
    actuals: { orderItemId: string; actualQuantity: number; photoUrl?: string | undefined }[],
    tx: PrismaTransaction,
  ): Promise<{ previousTotal: number; total: number }> {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });

    let subtotal = 0;
    for (const item of order.items) {
      const actual = actuals.find((entry) => entry.orderItemId === item.id);
      const quantity = actual === undefined ? Number(item.quantity) : actual.actualQuantity;
      const lineTotal = Math.round(item.unitPrice * quantity);

      if (actual !== undefined) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            actualQuantity: actual.actualQuantity,
            actualTotal: lineTotal,
            ...(actual.photoUrl !== undefined ? { weighingPhotoUrl: actual.photoUrl } : {}),
          },
        });
      }
      subtotal += lineTotal;
    }

    const total = Math.max(0, subtotal + order.deliveryFee + order.serviceFee - order.discount);
    await tx.order.update({ where: { id: orderId }, data: { subtotal, total } });

    return { previousTotal: order.total, total };
  }

  async countActiveForCustomer(customerId: string): Promise<number> {
    return this.prisma.order.count({
      where: { ...this.tenantScope(), customerId, status: { in: [...ACTIVE_ORDER_STATUSES] } },
    });
  }

  /** Orders stuck in a status for too long, for the operator dashboard. */
  async findStale(status: OrderStatus, olderThan: Date): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { ...this.tenantScope(), status, updatedAt: { lt: olderThan } },
      take: 100,
    });
  }
}
