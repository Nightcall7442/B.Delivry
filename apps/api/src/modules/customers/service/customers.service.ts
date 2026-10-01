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
import { customerMayShop } from '../../auth/guards/profile-access.js';
import type { AuthService } from '../../auth/service/auth.service.js';
import { assertMayManageAccount, isDeskContext } from '../../users/domain/account-rank.js';
import type { CustomersRepository, CustomerWithUser } from '../repository/customers.repository.js';
import type { CustomerListFilters, UpdateCustomerInput } from '../types/index.js';

export interface CustomersServiceDeps extends ServiceDeps {
  repository: CustomersRepository;
  /** A customer the desk blocks is signed out: their token must not outlive the decision. */
  auth: Pick<AuthService, 'logoutAll'>;
}

export class CustomersService extends BaseService {
  private readonly repository: CustomersRepository;
  private readonly auth: CustomersServiceDeps['auth'];

  constructor(deps: CustomersServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.auth = deps.auth;
  }

  private ownId(): string {
    const customerId = this.currentUser().customerId;
    if (customerId === undefined) throw new ForbiddenError('Customer profile required');
    return customerId;
  }

  /**
   * The caller's own profile, unless the desk has blocked it. The token already leaves a blocked
   * customer without a customerId; this makes the same call for the token issued before the block.
   */
  private async own(): Promise<CustomerWithUser> {
    const customer = await this.getRaw(this.ownId());
    if (!customerMayShop(customer)) throw new ForbiddenError('This account is blocked');
    return customer;
  }

  async me(): Promise<CustomerWithUser> {
    return this.own();
  }

  async updateMe(input: UpdateCustomerInput): Promise<CustomerWithUser> {
    const me = await this.own();
    // The default address is one of the caller's own: any other id would point a profile at a
    // stranger's door.
    if (
      input.defaultAddressId !== undefined &&
      input.defaultAddressId !== null &&
      !(await this.repository.ownsAddress(me.id, input.defaultAddressId))
    ) {
      throw new NotFoundError('Address', input.defaultAddressId);
    }
    return this.repository.update(me.id, input);
  }

  /**
   * The desk reads any customer of its tenant (customer:read is theirs: the matrix has no
   * customer:read_any, so the resource form of the check refuses every operator and admin); a
   * customer reads only themselves. Decided before the lookup, so a stranger cannot tell which ids
   * exist from 404 against 403.
   */
  async get(id: string): Promise<CustomerWithUser> {
    if (isDeskContext(this.context())) {
      this.authorize(PERMISSION.CUSTOMER_READ);
      return this.getRaw(id);
    }
    if (this.currentUser().customerId !== id) throw new ForbiddenError('Not your profile');
    return this.own();
  }

  async list(filters: CustomerListFilters): Promise<PaginatedResult<CustomerWithUser>> {
    this.authorize(PERMISSION.CUSTOMER_READ);
    return this.repository.list(filters);
  }

  async block(id: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    const customer = await this.getRaw(id);
    await this.assertMayManage(customer.userId);
    await this.repository.setBlocked(id, true);
    // Blocking has to take effect now, not when the access token expires.
    await this.auth.logoutAll(customer.userId);
  }

  async unblock(id: string): Promise<void> {
    this.authorize(PERMISSION.USER_WRITE);
    const customer = await this.getRaw(id);
    await this.assertMayManage(customer.userId);
    await this.repository.setBlocked(id, false);
  }

  /** The desk acts on customers, not on whoever their account happens to be (an admin's, say). */
  private async assertMayManage(userId: string): Promise<void> {
    assertMayManageAccount(this.context(), userId, await this.repository.rolesOfUser(userId));
  }

  /** Called from the delivered-order handler, not from a request. */
  /** My code and link to share. */
  async referral(): Promise<{ code: string }> {
    const me = await this.own();
    const code = await this.repository.ensureReferralCode(me.id, mintReferralCode);
    return { code };
  }

  /** "I have a friend's code": only before the first order, never one's own. */
  async applyReferral(code: string): Promise<void> {
    const me = await this.own();
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
    const me = await this.own();
    // The desk approved a company, and the credit it granted belongs to that company: applying again
    // under another name or INN would keep the approval and move it to a different one. Changing an
    // approved company is the desk's (setBusiness).
    if (
      me.businessApprovedAt !== null &&
      (me.companyName !== companyName || me.companyInn !== companyInn)
    ) {
      throw new ConflictError('The company is already approved; ask the desk to change it');
    }
    return this.repository.applyBusiness(me.id, companyName, companyInn);
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
    // Looked up inside the tenant first: credit is money, and the id alone must not reach another tenant's customer.
    await this.getRaw(customerId);
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
