/**
 * Couriers business logic. Shifts, availability, ratings, balances.
 */
import {
  COURIER_STATUS,
  type CourierStatus,
  NEIGHBOUR_COURIER,
  PERMISSION,
} from '@bazar/constants';
import { money } from '@bazar/payments';
import { startOfLocalDay } from '@bazar/utils';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import { couriersOnline } from '../../../infrastructure/telemetry/metrics.js';
import type { DeliveryService } from '../../delivery/service/delivery.service.js';
import type { PaymentsService } from '../../payments/service/payments.service.js';
import type { CouriersRepository, CourierWithUser } from '../repository/couriers.repository.js';
import type { CourierListFilters, CourierShift, RegisterCourierInput } from '../types/index.js';

export interface CouriersServiceDeps extends ServiceDeps {
  repository: CouriersRepository;
  delivery: DeliveryService;
  payments: PaymentsService;
}

export class CouriersService extends BaseService {
  private readonly repository: CouriersRepository;
  private readonly delivery: DeliveryService;
  private readonly payments: PaymentsService;

  constructor(deps: CouriersServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.delivery = deps.delivery;
    this.payments = deps.payments;
  }

  private ownId(): string {
    const courierId = this.currentUser().courierId;
    if (courierId === undefined) throw new ForbiddenError('Courier profile required');
    return courierId;
  }

  async me(): Promise<CourierWithUser> {
    return this.get(this.ownId());
  }

  async get(id: string): Promise<CourierWithUser> {
    const courier = await this.repository.findById(id);
    if (courier === null) throw new NotFoundError('Courier', id);
    return courier;
  }

  async list(filters: CourierListFilters): Promise<PaginatedResult<CourierWithUser>> {
    this.authorize(PERMISSION.COURIER_READ);
    return this.repository.list(filters);
  }

  /**
   * Going on and off shift. A courier carrying orders cannot go offline: the
   * customer is watching that dot move, so the trips have to be finished or
   * handed back first.
   */
  async setStatus(status: CourierStatus): Promise<CourierWithUser> {
    const courierId = this.ownId();
    const courier = await this.get(courierId);

    if (status === COURIER_STATUS.OFFLINE) {
      const active = await this.delivery.activeForCourier();
      if (active.length > 0) {
        throw new ConflictError('Finish or release your active deliveries before going offline');
      }
    }

    if (courier.status === COURIER_STATUS.SUSPENDED) {
      throw new ForbiddenError('This courier account is suspended');
    }
    if (status === COURIER_STATUS.ONLINE && courier.verifiedAt === null) {
      throw new ForbiddenError('The account is waiting for verification');
    }

    await this.repository.setStatus(courierId, status);
    couriersOnline.labels(courier.cityId).set(await this.repository.countOnline(courier.cityId));

    return this.get(courierId);
  }

  /** The courier app home screen: what today has looked like so far. */
  async shift(): Promise<CourierShift> {
    const courierId = this.ownId();
    const courier = await this.get(courierId);
    const stats = await this.repository.todayStats(courierId, startOfLocalDay());

    return {
      status: courier.status,
      since: courier.updatedAt,
      todayOrders: stats.orders,
      todayEarnings: stats.earnings,
      currency: courier.currency,
    };
  }

  async balance() {
    const courier = await this.me();
    return this.payments.balance(courier.userId);
  }

  /**
   * "Стать курьером махалли": a customer offers to walk orders to neighbours.
   * The profile waits for an operator's verify() before it can go online.
   */
  async applyNeighbour(addressId: string): Promise<CourierWithUser> {
    const user = this.currentUser();
    if (user.customerId === undefined) throw new ForbiddenError('Customer profile required');
    const existing = await this.repository.findByUserId(user.id);
    if (existing !== null) return existing;
    return this.repository.createNeighbour({
      userId: user.id,
      customerId: user.customerId,
      addressId,
      radiusMeters: NEIGHBOUR_COURIER.HOME_RADIUS_METERS,
    });
  }

  async register(input: RegisterCourierInput): Promise<CourierWithUser> {
    this.authorize(PERMISSION.COURIER_WRITE);

    const existing = await this.repository.findByUserId(input.userId);
    if (existing !== null) throw new ConflictError('This user is already a courier');

    return this.repository.create(input);
  }

  async update(id: string, data: Record<string, unknown>): Promise<CourierWithUser> {
    const courier = await this.get(id);
    // A courier may edit their own vehicle details; changing anyone else's,
    // or verifying an account, needs the staff permission.
    if (courier.id !== this.currentUser().courierId) {
      this.authorize(PERMISSION.COURIER_WRITE, { courierId: id });
    }

    return this.repository.update(id, {
      ...(data.vehicleType !== undefined ? { vehicleType: data.vehicleType as never } : {}),
      ...(data.plateNumber !== undefined ? { plateNumber: data.plateNumber as string } : {}),
      ...(data.maxConcurrentOrders !== undefined
        ? { maxConcurrentOrders: data.maxConcurrentOrders as number }
        : {}),
    });
  }

  async verify(id: string): Promise<CourierWithUser> {
    this.authorize(PERMISSION.COURIER_WRITE);
    return this.repository.update(id, { verifiedAt: new Date() });
  }

  async suspend(id: string): Promise<void> {
    this.authorize(PERMISSION.COURIER_WRITE);
    await this.repository.setStatus(id, COURIER_STATUS.SUSPENDED);
  }

  async refreshRating(courierId: string): Promise<void> {
    await this.repository.refreshRating(courierId);
  }

  /** Called when a delivery finishes, to keep the counters honest. */
  async recordCompletion(courierId: string, payout: number, orderId: string): Promise<void> {
    const courier = await this.repository.findById(courierId);
    if (courier === null) return;

    await this.repository.incrementCompleted(courierId);
    await this.payments.payoutCourier(
      courier.userId,
      money(payout, courier.currency as 'UZS'),
      orderId,
    );
  }

  async recordCancellation(courierId: string): Promise<void> {
    await this.repository.incrementCancelled(courierId);
  }
}
