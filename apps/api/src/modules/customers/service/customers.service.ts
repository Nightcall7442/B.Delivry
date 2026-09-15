/**
 * Customers business logic. Profiles, order history counters, blocking.
 */
import { PERMISSION } from '@bazar/constants';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import type { CustomersRepository, CustomerWithUser } from '../repository/customers.repository.js';
import type { CustomerListFilters, UpdateCustomerInput } from '../types/index.js';

export interface CustomersServiceDeps extends ServiceDeps {
  repository: CustomersRepository;
}

export class CustomersService extends BaseService {
  private readonly repository: CustomersRepository;

  constructor(deps: CustomersServiceDeps) {
    super(deps);
    this.repository = deps.repository;
  }

  private ownId(): string {
    const customerId = this.currentUser().customerId;
    if (customerId === undefined) throw new ForbiddenError('Customer profile required');
    return customerId;
  }

  async me(): Promise<CustomerWithUser> {
    return this.getRaw(this.ownId());
  }

  async updateMe(input: UpdateCustomerInput): Promise<CustomerWithUser> {
    return this.repository.update(this.ownId(), input);
  }

  async get(id: string): Promise<CustomerWithUser> {
    const customer = await this.getRaw(id);
    // A customer reading their own profile is fine; reading anyone else's
    // needs the staff permission.
    this.authorize(PERMISSION.CUSTOMER_READ, {
      tenantId: customer.tenantId,
      customerId: customer.id,
    });
    return customer;
  }

  async list(filters: CustomerListFilters): Promise<PaginatedResult<CustomerWithUser>> {
    this.authorize(PERMISSION.CUSTOMER_READ);
    return this.repository.list(filters);
  }

  async block(id: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.repository.setBlocked(id, true);
  }

  async unblock(id: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.repository.setBlocked(id, false);
  }

  /** Called from the delivered-order handler, not from a request. */
  /** My code and link to share. */
  async referral(): Promise<{ code: string }> {
    const code = await this.repository.ensureReferralCode(this.ownId(), mintReferralCode);
    return { code };
  }

  /** "I have a friend's code": only before the first order, never one's own. */
  async applyReferral(code: string): Promise<void> {
    const me = await this.getRaw(this.ownId());
    if (me.orderCount > 0 || me.referredById !== null) {
      throw new ConflictError('Referral codes work only before the first order');
    }
    const referrer = await this.repository.findByReferralCode(code.trim().toUpperCase());
    if (referrer === null) throw new NotFoundError('Referral code', code);
    if (referrer.id === me.id) throw new ConflictError('That is your own code');
    await this.repository.setReferredBy(me.id, referrer.id);
  }

  /** Both sides of a referral, once, on the newcomer's first delivered order. */
  claimReferralReward(customerId: string) {
    return this.repository.claimReferralReward(customerId);
  }

  /** A paid Plus month. Called by the payment handler, never from a request. */
  async activatePlus(customerId: string, days: number): Promise<Date> {
    return this.repository.extendPlus(customerId, days);
  }

  async recordDelivered(customerId: string, total: number): Promise<void> {
    await this.repository.recordDeliveredOrder(customerId, total);
  }

  /** B2B: "we are a café" — the company goes on invoices once an operator approves. */
  async applyBusiness(companyName: string, companyInn: string): Promise<CustomerWithUser> {
    return this.repository.applyBusiness(this.ownId(), companyName, companyInn);
  }

  async setBusiness(
    id: string,
    input: { approved: boolean; creditDays: number; creditLimit: number },
  ): Promise<CustomerWithUser> {
    this.authorize(PERMISSION.USER_WRITE);
    await this.getRaw(id);
    return this.repository.setBusiness(id, input);
  }

  /** Called by payments for a payer without a profile (a vendor buying a promotion). */
  ensureForUser(userId: string): Promise<string> {
    return this.repository.ensureForUser(userId, this.tenantId());
  }

  /** Store credit, e.g. compensation for a failed order. */
  async credit(customerId: string, amount: number): Promise<void> {
    this.authorize(PERMISSION.PAYMENT_REFUND);
    await this.repository.adjustBalance(customerId, amount);
  }

  private async getRaw(id: string): Promise<CustomerWithUser> {
    const customer = await this.repository.findById(id);
    if (customer === null) throw new NotFoundError('Customer', id);
    return customer;
  }
}

/** Six letters and digits without the look-alikes: read over the phone, typed on a keypad. */
function mintReferralCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
