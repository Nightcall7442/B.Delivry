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
import { courierMayWork } from '../../auth/guards/profile-access.js';
import type { AuthService } from '../../auth/service/auth.service.js';
import type { DeliveryService } from '../../delivery/service/delivery.service.js';
import type { PaymentsService } from '../../payments/service/payments.service.js';
import { assertMayManageAccount, isDesk } from '../../users/domain/account-rank.js';
import type { CouriersRepository, CourierWithUser } from '../repository/couriers.repository.js';
import type { CourierListFilters, CourierShift, RegisterCourierInput } from '../types/index.js';

export interface CouriersServiceDeps extends ServiceDeps {
  repository: CouriersRepository;
  delivery: DeliveryService;
  payments: PaymentsService;
  /** A courier the desk suspends is signed out: their token must not outlive the decision. */
  auth: Pick<AuthService, 'logoutAll'>;
}

export class CouriersService extends BaseService {
  private readonly repository: CouriersRepository;
  private readonly delivery: DeliveryService;
  private readonly payments: PaymentsService;
  private readonly auth: CouriersServiceDeps['auth'];

  constructor(deps: CouriersServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.delivery = deps.delivery;
    this.payments = deps.payments;
    this.auth = deps.auth;
  }

  private ownId(): string {
    const courierId = this.currentUser().courierId;
    if (courierId === undefined) throw new ForbiddenError('Courier profile required');
    return courierId;
  }

  /**
   * The courier's own row, if the desk lets them work. The token already leaves a suspended or
   * unverified courier without a courierId; this makes the same decision for the token that was
   * issued a minute before the desk acted.
   */
  private async activeOwn(): Promise<CourierWithUser> {
    const courier = await this.find(this.ownId());
    this.assertMayWork(courier);
    return courier;
  }

  private assertMayWork(courier: CourierWithUser): void {
    if (courier.status === COURIER_STATUS.SUSPENDED) {
      throw new ForbiddenError('This courier account is suspended');
    }
    if (!courierMayWork(courier)) {
      throw new ForbiddenError('The account is waiting for verification');
    }
  }

  async me(): Promise<CourierWithUser> {
    return this.activeOwn();
  }

  /** A roster entry, for the desk. The courier's own row goes through me(). */
  async get(id: string): Promise<CourierWithUser> {
    this.authorize(PERMISSION.COURIER_READ);
    return this.find(id);
  }

  /** Tenant-scoped: another tenant's courier is a 404, whoever asks. */
  private async find(id: string): Promise<CourierWithUser> {
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
    const courier = await this.activeOwn();

    if (status === COURIER_STATUS.OFFLINE) {
      const active = await this.delivery.activeForCourier();
      if (active.length > 0) {
        throw new ConflictError('Finish or release your active deliveries before going offline');
      }
    }

    // The write itself refuses a courier the desk suspended since the read above.
    if (!(await this.repository.setOwnStatus(courier.id, status))) {
      throw new ForbiddenError('This courier account is suspended');
    }
    couriersOnline.labels(courier.cityId).set(await this.repository.countOnline(courier.cityId));

    return this.find(courier.id);
  }

  /** The courier app home screen: what today has looked like so far. */
  async shift(): Promise<CourierShift> {
    const courier = await this.activeOwn();
    const stats = await this.repository.todayStats(courier.id, startOfLocalDay());

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
   * Only the profile is created. It can neither go online nor sign in to the courier app until an
   * operator's verify(), which is also what grants the COURIER role.
   */
  async applyNeighbour(addressId: string): Promise<CourierWithUser> {
    const user = this.currentUser();
    if (user.customerId === undefined) throw new ForbiddenError('Customer profile required');
    const existing = await this.repository.findByUserId(user.id);
    if (existing !== null) return existing;
    try {
      return await this.repository.createNeighbour({
        userId: user.id,
        customerId: user.customerId,
        addressId,
        radiusMeters: NEIGHBOUR_COURIER.HOME_RADIUS_METERS,
      });
    } catch (error) {
      // A double tap: the first request made the profile (one per user), this one is the same ask.
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const created = await this.repository.findByUserId(user.id);
      if (created === null) throw error;
      return created;
    }
  }

  async register(input: RegisterCourierInput): Promise<CourierWithUser> {
    this.authorize(PERMISSION.COURIER_WRITE);

    const existing = await this.repository.findByUserId(input.userId);
    if (existing !== null) throw new ConflictError('This user is already a courier');

    return this.repository.create(input);
  }

  /**
   * A courier edits their own vehicle details and nothing operational: how many orders they carry at
   * once is the desk's call, or anyone could raise it for themselves. Everyone else's record is the
   * desk's (courier:write), and only inside this tenant: the row is looked up scoped first.
   */
  async update(id: string, data: Record<string, unknown>): Promise<CourierWithUser> {
    const courier = await this.find(id);
    const user = this.currentUser();

    if (isDesk(user)) {
      this.authorize(PERMISSION.COURIER_WRITE);
    } else {
      if (courier.id !== user.courierId) {
        throw new ForbiddenError('Only the desk may change another courier', {
          meta: { courierId: id, userId: user.id },
        });
      }
      this.assertMayWork(courier);
      // A form posts the whole card: sending back what is already there is not a change.
      if (
        data.maxConcurrentOrders !== undefined &&
        data.maxConcurrentOrders !== courier.maxConcurrentOrders
      ) {
        throw new ForbiddenError('Only the desk may change how many orders a courier carries', {
          meta: { courierId: id, userId: user.id },
        });
      }
    }

    return this.repository.update(id, {
      ...(data.vehicleType !== undefined ? { vehicleType: data.vehicleType as never } : {}),
      ...(data.plateNumber !== undefined ? { plateNumber: data.plateNumber as string } : {}),
      ...(data.maxConcurrentOrders !== undefined
        ? { maxConcurrentOrders: data.maxConcurrentOrders as number }
        : {}),
    });
  }

  /** The desk's yes: the account may go online, and gets the COURIER role to sign in with. */
  async verify(id: string): Promise<CourierWithUser> {
    this.authorize(PERMISSION.COURIER_WRITE);
    const courier = await this.find(id);
    await this.assertMayManage(courier.userId);
    return this.repository.verify(
      id,
      courier.userId,
      courier.verifiedAt ?? new Date(),
      this.context().user?.id ?? null,
    );
  }

  /**
   * The desk's no. The courier stops being able to act at once: their sessions end (they can sign in
   * again, but a suspended courier gets no courierId on the token), and going online is refused by
   * status. Deliveries already assigned are not touched here; the desk reassigns them.
   */
  async suspend(id: string): Promise<void> {
    this.authorize(PERMISSION.COURIER_WRITE);
    const courier = await this.find(id);
    await this.assertMayManage(courier.userId);
    await this.repository.setStatus(id, COURIER_STATUS.SUSPENDED);
    await this.auth.logoutAll(courier.userId);
    couriersOnline.labels(courier.cityId).set(await this.repository.countOnline(courier.cityId));
  }

  /** The desk acts on couriers, not on whoever their account happens to be (an admin's, say). */
  private async assertMayManage(userId: string): Promise<void> {
    assertMayManageAccount(this.context(), userId, await this.repository.rolesOfUser(userId));
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
