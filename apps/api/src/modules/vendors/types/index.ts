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
  userId: string;
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
  pending: number;
  currency: string;
  orderCount: number;
}
