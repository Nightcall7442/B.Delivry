/**
 * What a stall may see and hear. The order DTO was role-blind, so every vendor got the customer's
 * phone, the door and the recipient for every order of their stall; the list picked one identity
 * per account, so an owner who is also a customer saw none of their stall's orders; any vendor
 * could listen to any store's room; and `order:update` let a stall mark its own invoice paid.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/common/errors/index.js';
import { toOrderDto } from '../../src/common/dto/index.js';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { OrdersService } from '../../src/modules/orders/service/orders.service.js';
import { canJoinRoom } from '../../src/websocket/auth.js';

const STALL = 'vendor-stall';

const as = (roles: string[], ids: Record<string, string> = {}) => {
  const user = {
    id: `user-${roles.join('-')}`,
    tenantId: 't1',
    roles,
    permissions: effectivePermissions(roles as never),
    ...ids,
  };
  return {
    user: user as never,
    context: { ...systemContext('t1', 'r1', 'ru'), system: undefined, user } as never,
  };
};
const stall = as(['VENDOR'], { vendorId: STALL });
const otherStall = as(['VENDOR'], { vendorId: 'vendor-other' });
const desk = as(['ADMIN']);
const customer = as(['CUSTOMER'], { customerId: 'cust-1' });
const courier = as(['COURIER'], { courierId: 'courier-1' });
const ownerWhoAlsoOrders = as(['VENDOR', 'CUSTOMER'], { vendorId: STALL, customerId: 'cust-9' });

const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 'o1',
    tenantId: 't1',
    number: 'BZ-1',
    status: 'CONFIRMED',
    customerId: 'cust-1',
    storeId: 'st1',
    courierId: 'courier-1',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    subtotal: 30000,
    deliveryFee: 12107,
    serviceFee: 1000,
    discount: 0,
    total: 43107,
    currency: 'UZS',
    addressCityId: 'city',
    addressFormatted: 'Ургенч, ул. Аль-Хорезми, 12, кв. 5',
    addressStreet: 'ул. Аль-Хорезми',
    addressHouse: '12',
    addressApartment: '5',
    addressEntrance: '2',
    addressFloor: '3',
    addressLandmark: 'у аптеки',
    addressInstructions: 'код домофона 1234',
    addressLat: 41.55,
    addressLng: 60.63,
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    comment: 'позвоните у подъезда',
    vendorComment: 'побольше зелени',
    substitutionPolicy: 'CALL',
    recipientName: 'Мама',
    recipientPhone: '+998901112233',
    groupId: null,
    dueAt: null,
    scheduledFor: null,
    promisedAt: null,
    etaAt: null,
    placedAt: new Date(0),
    deliveredAt: null,
    cancelledAt: null,
    cancelReason: null,
    items: [],
    statusHistory: [{ status: 'CONFIRMED', at: new Date(0), actorId: 'staff-7', comment: null }],
    delivery: null,
    customer: { id: 'cust-1', userId: 'u-c', user: { firstName: 'Бобур', phone: '+998905551122' } },
    store: {
      id: 'st1',
      vendorId: STALL,
      name: { ru: 'Тандыр-нон' },
      type: 'BAZAAR_STALL',
      status: 'ACTIVE',
      rating: 4.8,
      logoUrl: null,
      phone: null,
      standNumber: null,
      address: null,
      lat: 41.55,
      lng: 60.63,
    },
    ...over,
  }) as never;

const dtoFor = (who: { context: never }) => runWithContext(who.context, () => toOrderDto(row()));

describe('the order as each party sees it', () => {
  it('gives the stall the first name and nothing to call or find', () => {
    const dto = dtoFor(stall);
    expect(dto.customer).toEqual({ id: 'cust-1', firstName: 'Бобур', phone: '' });
    expect(dto.recipientName).toBeNull();
    expect(dto.recipientPhone).toBeNull();
    expect(dto.comment).toBeNull();
    expect(dto.address).toMatchObject({
      formatted: '',
      street: null,
      entrance: null,
      instructions: null,
      point: null,
    });
    expect(dto.statusHistory[0]?.actorId).toBeNull();
    // What the stall does need stays.
    expect(dto.vendorComment).toBe('побольше зелени');
    expect(dto.totals.subtotal.amount).toBe(30000);
  });

  it('keeps everything for the customer, the desk and the order’s own courier', () => {
    for (const who of [customer, desk, courier]) {
      const dto = dtoFor(who);
      expect(dto.customer?.phone).toBe('+998905551122');
      expect(dto.address.formatted).toContain('Аль-Хорезми');
      expect(dto.recipientPhone).toBe('+998901112233');
      expect(dto.comment).toBe('позвоните у подъезда');
    }
  });

  it('masks only a stall-only viewer; the owner who also orders keeps their own orders whole', () => {
    const other = as(['COURIER'], { courierId: 'courier-2' });
    // Anyone else is turned away by the read check before the mapper; it masks the stall-only view.
    expect(dtoFor(other).customer?.phone).toBe('+998905551122');
    const ordersOwn = runWithContext(ownerWhoAlsoOrders.context, () =>
      toOrderDto(
        row({
          customerId: 'cust-9',
          customer: { id: 'cust-9', userId: 'u', user: { firstName: 'Я', phone: '+998900000000' } },
        }),
      ),
    );
    expect(ordersOwn.customer?.phone).toBe('+998900000000');
  });

  it('maps without a user (webhooks, jobs) as before', () => {
    expect(toOrderDto(row()).customer?.phone).toBe('+998905551122');
  });
});

function ordersService(rows: { filters: unknown[] }) {
  return new OrdersService({
    repository: {
      async list(filters: unknown) {
        rows.filters.push(filters);
        return { items: [], pagination: {} };
      },
      async findById() {
        return row({ paymentMethod: 'INVOICE' });
      },
    },
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
    autoConfirm: async () => false,
  } as never);
}

describe('the orders list', () => {
  it('gives an owner who is also a customer their stall’s orders when the seller app asks', async () => {
    const seen = { filters: [] as unknown[] };
    await runWithContext(ownerWhoAlsoOrders.context, () =>
      ordersService(seen).list({ as: 'store', storeId: 'st1', pageSize: 50 } as never),
    );
    expect(seen.filters[0]).toMatchObject({ vendorId: STALL, storeId: 'st1' });
    expect(seen.filters[0]).not.toHaveProperty('customerId');
  });

  it('keeps that same account’s own purchases in the customer app, even with a storeId', async () => {
    const seen = { filters: [] as unknown[] };
    await runWithContext(ownerWhoAlsoOrders.context, () =>
      ordersService(seen).list({ storeId: 'st1' } as never),
    );
    expect(seen.filters[0]).toMatchObject({ customerId: 'cust-9' });
    expect(seen.filters[0]).not.toHaveProperty('vendorId');
  });

  it('does not let a plain customer widen their list by naming the selector', async () => {
    const seen = { filters: [] as unknown[] };
    await runWithContext(customer.context, () =>
      ordersService(seen).list({ as: 'store', storeId: 'st1' } as never),
    );
    expect(seen.filters[0]).toMatchObject({ customerId: 'cust-1' });
    expect(seen.filters[0]).not.toHaveProperty('vendorId');
  });

  it('keeps an ordinary customer, and a stall without a selector, as before', async () => {
    const seen = { filters: [] as unknown[] };
    await runWithContext(customer.context, () =>
      ordersService(seen).list({ storeId: 'st1' } as never),
    );
    await runWithContext(stall.context, () => ordersService(seen).list({} as never));
    expect(seen.filters[0]).toMatchObject({ customerId: 'cust-1' });
    expect(seen.filters[1]).toMatchObject({ vendorId: STALL });
  });
});

describe('marking an invoice paid', () => {
  it('is the desk’s: the stall of that very order is refused', async () => {
    const svc = ordersService({ filters: [] });
    await expect(
      runWithContext(stall.context, () => svc.markInvoicePaid('o1')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runWithContext(desk.context, () => svc.markInvoicePaid('o1')),
    ).resolves.toBeDefined();
  });
});

describe('the store room of the socket', () => {
  const ownsStore = async (storeId: string, user: { vendorId?: string }) =>
    storeId === 'st1' && user.vendorId === STALL;
  const join = (who: { user: never }, room: string) =>
    canJoinRoom(who.user, room, async () => false, ownsStore as never);

  it('is open to the vendor of that store and to the desk, and to nobody else', async () => {
    expect(await join(stall, 'store:st1')).toBe(true);
    expect(await join(desk, 'store:st1')).toBe(true);
    expect(await join(otherStall, 'store:st1')).toBe(false);
    expect(await join(customer, 'store:st1')).toBe(false);
    expect(await join(stall, 'store:st2')).toBe(false);
  });
});
