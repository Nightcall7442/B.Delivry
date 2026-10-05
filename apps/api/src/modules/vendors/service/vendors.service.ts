/**
 * Vendors business logic. Onboarding, verification, payouts.
 */
import { PERMISSION } from '@bazar/constants';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { PaginatedResult } from '../../../common/pagination/index.js';
import { vendorMayTrade } from '../../auth/guards/profile-access.js';
import type { AuthService } from '../../auth/service/auth.service.js';
import { assertMayManageAccount, isDeskContext } from '../../users/domain/account-rank.js';
import type { VendorsRepository, VendorWithCounts } from '../repository/vendors.repository.js';
import type {
  CreateVendorInput,
  PayoutSummary,
  VendorListFilters,
  VendorStatus,
} from '../types/index.js';

export interface VendorsServiceDeps extends ServiceDeps {
  repository: VendorsRepository;
  /** A vendor the desk suspends or rejects is signed out: their token must not outlive the decision. */
  auth: Pick<AuthService, 'logoutAll'>;
}

export class VendorsService extends BaseService {
  private readonly repository: VendorsRepository;
  private readonly auth: VendorsServiceDeps['auth'];

  constructor(deps: VendorsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.auth = deps.auth;
  }

  private ownId(): string {
    const vendorId = this.currentUser().vendorId;
    if (vendorId === undefined) throw new ForbiddenError('Vendor profile required');
    return vendorId;
  }

  /**
   * The caller's own vendor row, unless the desk has suspended or rejected it. The token already
   * leaves such a vendor without a vendorId; this makes the same call for the token issued before.
   * A PENDING vendor stays: a new seller opens the cabinet while the desk looks at them.
   */
  private async own(): Promise<VendorWithCounts> {
    const vendor = await this.getRaw(this.ownId());
    if (!vendorMayTrade(vendor)) throw new ForbiddenError('This vendor account is not active');
    return vendor;
  }

  async me(): Promise<VendorWithCounts> {
    return this.own();
  }

  /**
   * «Стать продавцом»: the caller's own application, whatever the desk decided — a customer who
   * applied has no vendorId on the token yet, so this reads by user. Null = never applied.
   */
  async myApplication(): Promise<{
    id: string;
    status: VendorStatus;
    displayName: string;
    createdAt: Date;
  } | null> {
    const vendor = await this.repository.findByUserId(this.currentUser().id);
    if (vendor === null) return null;
    return {
      id: vendor.id,
      status: vendor.status as VendorStatus,
      displayName: vendor.displayName,
      createdAt: vendor.createdAt,
    };
  }

  /**
   * The desk, or the vendor the id names. The matrix has no vendor:*_any twin, so asking `can()` with
   * the vendor as the resource refused every operator and admin and left the rule to the permission
   * alone; who may touch which vendor is decided here instead, before any lookup, so a stranger cannot
   * tell which ids exist from 404 against 403.
   */
  private assertDeskOrOwn(id: string): void {
    if (isDeskContext(this.context())) return;
    if (this.currentUser().vendorId !== id) throw new ForbiddenError('Not your vendor profile');
  }

  /** The desk reads any vendor of its tenant (vendor:read is theirs); a vendor reads only their own row. */
  async get(id: string): Promise<VendorWithCounts> {
    this.assertDeskOrOwn(id);
    if (!isDeskContext(this.context())) return this.own();
    this.authorize(PERMISSION.VENDOR_READ);
    return this.getRaw(id);
  }

  async list(filters: VendorListFilters): Promise<PaginatedResult<VendorWithCounts>> {
    this.authorize(PERMISSION.VENDOR_READ);
    return this.repository.list(filters);
  }

  /**
   * A vendor signs up but cannot trade until a human has looked at them:
   * new records start PENDING and their stores stay invisible until then.
   */
  async register(input: CreateVendorInput): Promise<VendorWithCounts> {
    // Anyone signed in may apply, but for themselves: a vendor record (legal name, phone, bank
    // account) bound to another user is the desk's to create, whatever the body says.
    const user = this.currentUser();
    const userId =
      user.permissions.includes(PERMISSION.VENDOR_WRITE) && input.userId !== undefined
        ? input.userId
        : user.id;

    const existing = await this.repository.findByUserId(userId);
    if (existing !== null) throw new ConflictError('This user is already a vendor');

    // Registered businesses must supply a tax id; bazaar sellers trading as
    // individuals legitimately have none.
    if (input.legalType !== 'UNREGISTERED' && input.taxId === undefined) {
      throw new ConflictError('A tax id (STIR) is required for registered businesses');
    }

    return this.repository.create({ ...input, userId });
  }

  async update(id: string, data: Record<string, unknown>): Promise<VendorWithCounts> {
    this.assertDeskOrOwn(id);
    // The legal name, phone and bank account are the desk's to change: vendor:write is theirs, and
    // the vendor role does not hold it.
    this.authorize(PERMISSION.VENDOR_WRITE);
    await this.getRaw(id);

    return this.repository.update(id, {
      ...(data.displayName !== undefined ? { displayName: data.displayName as string } : {}),
      ...(data.legalName !== undefined ? { legalName: data.legalName as string } : {}),
      ...(data.phone !== undefined ? { phone: data.phone as string } : {}),
      ...(data.email !== undefined ? { email: data.email as string } : {}),
      ...(data.bankAccount !== undefined ? { bankAccount: data.bankAccount as string } : {}),
    });
  }

  async setStatus(id: string, status: VendorStatus): Promise<void> {
    this.authorize(PERMISSION.VENDOR_WRITE);
    const vendor = await this.getRaw(id);
    const roles = await this.repository.rolesOfUser(vendor.userId);
    assertMayManageAccount(this.context(), vendor.userId, roles);

    await this.repository.setStatus(id, status, {
      userId: vendor.userId,
      grantedBy: this.context().user?.id ?? null,
    });
    // A "no" takes hold now, not when the access token expires. A yes needs no sign-out: the vendor's
    // next token already carries the vendorId again.
    if (!vendorMayTrade({ status })) await this.auth.logoutAll(vendor.userId);
  }

  /** Commission override for a negotiated deal with one vendor. */
  async setCommission(id: string, percent: number | null): Promise<VendorWithCounts> {
    this.authorize(PERMISSION.PRICING_WRITE);
    // Inside the tenant first: the id alone must not reach another tenant's vendor.
    await this.getRaw(id);
    return this.repository.update(id, { commissionPercent: percent });
  }

  /** The desk reads any vendor's payout (payment:read is theirs too); a vendor reads only their own. */
  async payout(id: string, since?: Date): Promise<PayoutSummary> {
    this.assertDeskOrOwn(id);
    this.authorize(PERMISSION.PAYMENT_READ);
    const vendor = isDeskContext(this.context()) ? await this.getRaw(id) : await this.own();
    return this.repository.pendingPayout(vendor.id, since);
  }

  async myPayout(since?: Date): Promise<PayoutSummary> {
    const vendor = await this.own();
    return this.repository.pendingPayout(vendor.id, since);
  }

  private async getRaw(id: string): Promise<VendorWithCounts> {
    const vendor = await this.repository.findById(id);
    if (vendor === null) throw new NotFoundError('Vendor', id);
    return vendor;
  }
}
