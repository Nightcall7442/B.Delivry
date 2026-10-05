/**
 * Vendors module-internal types & DTOs.
 */
export type VendorLegalType = 'INDIVIDUAL_ENTREPRENEUR' | 'LLC' | 'UNREGISTERED';
export type VendorStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export interface VendorListFilters {
  status?: VendorStatus | undefined;
  legalType?: VendorLegalType | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CreateVendorInput {
  /** The desk registers someone; an applicant applies for themselves and sends none. */
  userId?: string | undefined;
  legalType: VendorLegalType;
  legalName: string;
  displayName: string;
  taxId?: string | undefined;
  phone: string;
  email?: string | undefined;
  bankAccount?: string | undefined;
}

/** What a vendor is owed for delivered orders not yet paid out. */
export interface PayoutSummary {
  vendorId: string;
  /** Everything owed: available + on hold. */
  pending: number;
  /** Past the complaint window with no open complaint: may be paid out. */
  available: number;
  /** Still inside the freshness window, or under an open complaint. */
  onHold: number;
  onHoldOrders: number;
  /** When the first window-held order clears (ISO); null when none is waiting on the clock. */
  releasesAt: string | null;
  currency: string;
  orderCount: number;
}
