/**
 * vendor types / DTOs.
 */
import type { Id, MoneyDto, TenantEntity } from './common.js';

export const VENDOR_LEGAL_TYPE = {
  /** Yakka tartibdagi tadbirkor: individual entrepreneur. */
  INDIVIDUAL_ENTREPRENEUR: 'INDIVIDUAL_ENTREPRENEUR',
  LLC: 'LLC',
  /** Bazaar sellers who trade without registration; payouts stay in cash. */
  UNREGISTERED: 'UNREGISTERED',
} as const;

export type VendorLegalType = (typeof VENDOR_LEGAL_TYPE)[keyof typeof VENDOR_LEGAL_TYPE];

export const VENDOR_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
} as const;

export type VendorStatus = (typeof VENDOR_STATUS)[keyof typeof VENDOR_STATUS];

export interface VendorDto extends TenantEntity {
  userId: Id;
  legalType: VendorLegalType;
  status: VendorStatus;
  legalName: string;
  displayName: string;
  /** STIR/INN. Absent for unregistered bazaar sellers. */
  taxId: string | null;
  phone: string;
  email: string | null;
  bankAccount: string | null;
  /** Percent the platform keeps; overrides the tariff default when set. */
  commissionPercent: number | null;
  storeCount: number;
  /** Owed to the vendor for delivered orders not yet paid out. */
  pendingPayout: MoneyDto;
  verifiedAt: string | null;
}

export interface CreateVendorDto {
  legalType: VendorLegalType;
  legalName: string;
  displayName: string;
  taxId?: string;
  phone: string;
  email?: string;
  bankAccount?: string;
}

export type UpdateVendorDto = Partial<CreateVendorDto> & {
  status?: VendorStatus;
  commissionPercent?: number | null;
};

export interface VendorListQuery {
  status?: VendorStatus;
  legalType?: VendorLegalType;
  search?: string;
}
