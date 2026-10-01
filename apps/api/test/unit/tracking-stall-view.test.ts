/**
 * The live map carries the customer's door and the road to it. The order DTO already hides both from
 * the stall; the tracking view is a second way to the same data, so it has to hide them too.
 */
import { effectivePermissions } from '@bazar/auth';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import { TrackingService, stallView } from '../../src/modules/tracking/service/tracking.service.js';

const STALL = 'vendor-stall';

const as = (roles: string[], ids: Record<string, string> = {}) =>
  ({
    ...systemContext('t1', 'r1', 'ru'),
    system: undefined,
    user: {
      id: `user-${roles.join('-')}`,
      tenantId: 't1',
      roles,
      permissions: effectivePermissions(roles as never),
      ...ids,
    },
  }) as never;

const stall = as(['VENDOR'], { vendorId: STALL });
const desk = as(['ADMIN']);
const customer = as(['CUSTOMER'], { customerId: 'cust-1' });
const courier = as(['COURIER'], { courierId: 'courier-1' });

function service(status: string) {
  const order = {
    id: 'o1',
    status,
    customerId: 'cust-1',
    courierId: 'courier-1',
    addressLat: 41.55,
    addressLng: 60.63,
    store: { vendorId: STALL },
  };
  return new TrackingService({
    repository: {
      async lastLocation() {
        return { lat: 41.56, lng: 60.64, at: new Date(0) };
      },
      async courierProfile() {
        return { id: 'courier-1', firstName: 'Жасур' };
      },
    },
    orders: {
      async get() {
        return order;
      },
    },
    delivery: {
      async findByOrder() {
        return { pickupLat: 41.57, pickupLng: 60.65, etaAt: new Date(1), distanceMeters: 900 };
      },
    },
    eta: {
      async estimate() {
        return { arrivesAt: new Date(2), seconds: 300, distanceMeters: 1200, geometry: 'abc' };
      },
    },
    realtime: {},
    logger: { error() {}, warn() {}, info() {}, debug() {} },
  } as never);
}

describe('tracking an order', () => {
  it('gives the customer, the desk and the carrying courier the whole map', async () => {
    for (const who of [customer, desk, courier]) {
      const view = await runWithContext(who, () => service('IN_DELIVERY').trackOrder('o1'));
      expect(view.dropoffPoint).toEqual({ lat: 41.55, lng: 60.63 });
      expect(view.routeGeometry).toBe('abc');
      expect(view.etaSeconds).toBe(300);
      expect(view.courierPoint).not.toBeNull();
    }
  });

  it('stops following the courier once the order is closed', async () => {
    // Their latest fix belongs to whatever trip they are on now, not to this order.
    for (const status of ['DELIVERED', 'CANCELLED', 'FAILED']) {
      for (const who of [customer, desk, courier]) {
        const view = await runWithContext(who, () => service(status).trackOrder('o1'));
        expect(view.courierPoint, status).toBeNull();
        expect(view.courierUpdatedAt).toBeNull();
        expect(view.routeGeometry).toBeNull();
        expect(view.etaSeconds).toBeNull();
      }
    }
    // While it is open the same person does get the dot.
    const live = await runWithContext(customer, () => service('IN_DELIVERY').trackOrder('o1'));
    expect(live.courierPoint).not.toBeNull();
  });

  it('keeps the drop-off, the route and the drive time from the stall', async () => {
    const view = await runWithContext(stall, () => service('IN_DELIVERY').trackOrder('o1'));
    expect(view.dropoffPoint).toBeNull();
    expect(view.routeGeometry).toBeNull();
    expect(view.etaAt).toBeNull();
    expect(view.etaSeconds).toBeNull();
    expect(view.distanceMeters).toBeNull();
    // Past the counter the courier's dot is the way to the door.
    expect(view.courierPoint).toBeNull();
    expect(view.courierUpdatedAt).toBeNull();
    expect(view.pickupPoint).toEqual({ lat: 41.57, lng: 60.65 });
  });

  it('lets the stall watch the courier arrive at the counter', () => {
    const base = {
      orderId: 'o1',
      courier: null,
      courierPoint: { lat: 1, lng: 2 },
      courierUpdatedAt: new Date(0),
      pickupPoint: { lat: 3, lng: 4 },
      dropoffPoint: { lat: 5, lng: 6 },
      etaAt: new Date(1),
      etaSeconds: 60,
      distanceMeters: 10,
      routeGeometry: 'x',
    };
    for (const status of ['COURIER_ASSIGNED', 'COURIER_ARRIVED_PICKUP', 'PICKING_UP']) {
      const view = stallView({ ...base, status } as never);
      expect(view.courierPoint).toEqual({ lat: 1, lng: 2 });
      expect(view.dropoffPoint).toBeNull();
    }
    for (const status of ['PICKED_UP', 'IN_DELIVERY', 'COURIER_ARRIVED', 'DELIVERED']) {
      expect(stallView({ ...base, status } as never).courierPoint).toBeNull();
    }
  });
});
