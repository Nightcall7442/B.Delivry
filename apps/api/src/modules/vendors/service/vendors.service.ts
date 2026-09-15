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
import type { VendorsRepository, VendorWithCounts } from '../repository/vendors.repository.js';
import type {
  CreateVendorInput,
  PayoutSummary,
  VendorListFilters,
  VendorStatus,
} from '../types/index.js';

export interface VendorsServiceDeps extends ServiceDeps {
  repository: VendorsRepository;
}

export class VendorsService extends BaseService {
  private readonly repository: VendorsRepository;

  constructor(deps: VendorsServiceDeps) {
    super(deps);
    this.repository = deps.repository;
  }

  private ownId(): string {
    const vendorId = this.currentUser().vendorId;
    if (vendorId === undefined) throw new ForbiddenError('Vendor profile required');
    return vendorId;
  }

  async me(): Promise<VendorWithCounts> {
    return this.getRaw(this.ownId());
  }

  async get(id: string): Promise<VendorWithCounts> {
    const vendor = await this.getRaw(id);
    this.authorize(PERMISSION.VENDOR_READ, { tenantId: vendor.tenantId, vendorId: vendor.id });
    return vendor;
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
    const existing = await this.repository.findByUserId(input.userId);
    if (existing !== null) throw new ConflictError('This user is already a vendor');

    // Registered businesses must supply a tax id; bazaar sellers trading as
    // individuals legitimately have none.
    if (input.legalType !== 'UNREGISTERED' && input.taxId === undefined) {
      throw new ConflictError('A tax id (STIR) is required for registered businesses');
    }

    return this.repository.create(input);
  }

  async update(id: string, data: Record<string, unknown>): Promise<VendorWithCounts> {
    const vendor = await this.getRaw(id);
    this.authorize(PERMISSION.VENDOR_WRITE, { tenantId: vendor.tenantId, vendorId: vendor.id });

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
    await this.repository.setStatus(id, status);
  }

  /** Commission override for a negotiated deal with one vendor. */
  async setCommission(id: string, percent: number | null): Promise<VendorWithCounts> {
    this.authorize(PERMISSION.PRICING_WRITE);
    return this.repository.update(id, { commissionPercent: percent });
  }

  async payout(id: string, since?: Date): Promise<PayoutSummary> {
    const vendor = await this.getRaw(id);
    this.authorize(PERMISSION.PAYMENT_READ, { tenantId: vendor.tenantId, vendorId: vendor.id });
    return this.repository.pendingPayout(id, since);
  }

  async myPayout(since?: Date): Promise<PayoutSummary> {
    return this.repository.pendingPayout(this.ownId(), since);
  }

  private async getRaw(id: string): Promise<VendorWithCounts> {
    const vendor = await this.repository.findById(id);
    if (vendor === null) throw new NotFoundError('Vendor', id);
    return vendor;
  }
}
