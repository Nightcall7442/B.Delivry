/**
 * The ownership questions behind a room join, answered from the database.
 */
import type { PrismaClient } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../common/errors/index.js';
import { standingOn } from '../modules/orders/domain/order-party.js';
import type { OrdersService } from '../modules/orders/service/orders.service.js';
import type { RoomGuards } from './auth.js';

export interface RoomGuardDeps {
  prisma: Pick<PrismaClient, 'store' | 'courier' | 'address'>;
  orders: Pick<OrdersService, 'get'>;
}

/**
 * Every lookup carries the user's tenant. Ids are guessable only by luck, but a room name is
 * typed by the client, so "the id exists" is never an answer: it has to exist for THIS tenant.
 */
export function createRoomGuards({ prisma, orders }: RoomGuardDeps): RoomGuards {
  return {
    // The orders service enforces tenant and party (customer, courier, stall, desk). The stall is
    // left out on purpose: the order room carries the courier's dot to the door and the chat, and
    // the stall sees neither (it hears its own orders in the store room). A lookup that FAILS, as
    // opposed to refusing, is thrown: the caller denies a join but must not drop a held room
    // because the database blinked.
    ownsOrder: async (orderId, user) => {
      try {
        const order = await orders.get(orderId);
        return (
          standingOn(user, order).staff ||
          order.customerId === user.customerId ||
          (order.courierId !== null && order.courierId === user.courierId)
        );
      } catch (error) {
        if (error instanceof ForbiddenError || error instanceof NotFoundError) return false;
        throw error;
      }
    },

    // A vendor listens to the rooms of their own stalls only.
    ownsStore: async (storeId, user) => {
      if (user.vendorId === undefined) return false;
      const store = await prisma.store.findFirst({
        where: { id: storeId, tenantId: user.tenantId, vendorId: user.vendorId },
        select: { id: true },
      });
      return store !== null;
    },

    storeInTenant: async (storeId, user) => {
      const store = await prisma.store.findFirst({
        where: { id: storeId, tenantId: user.tenantId },
        select: { id: true },
      });
      return store !== null;
    },

    // Cities are shared reference data (GeoPlace has no tenant), so "the tenant's city" can only
    // mean one it has business in: a stall or a courier there. A saved customer address is no proof:
    // anybody can save one in any city.
    cityInTenant: async (cityId, user) => {
      const where = { tenantId: user.tenantId, cityId };
      const select = { id: true } as const;
      const [store, courier] = await Promise.all([
        prisma.store.findFirst({ where, select }),
        prisma.courier.findFirst({ where, select }),
      ]);
      return store !== null || courier !== null;
    },
  };
}
