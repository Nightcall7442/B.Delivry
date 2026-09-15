/**
 * customer types / DTOs.
 */
import type { Id, MoneyDto, TenantEntity } from './common.js';

export interface CustomerDto extends TenantEntity {
  userId: Id;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  email: string | null;
  defaultAddressId: Id | null;
  orderCount: number;
  totalSpent: MoneyDto;
  /** Store credit from refunds and referrals. */
  balance: MoneyDto;
  loyaltyPoints: number;
  plusUntil: string | null;
  referralCode: string | null;
  marketingOptIn: boolean;
  blockedAt: string | null;
  lastOrderAt: string | null;
  /** B2B: the company on invoices; credit once an operator approved. */
  companyName: string | null;
  companyInn: string | null;
  businessAppliedAt: string | null;
  businessApprovedAt: string | null;
  creditDays: number;
  /** Minor units. */
  creditLimit: number;
}

export interface CustomerListQuery {
  search?: string;
  cityId?: Id;
  blocked?: boolean;
  minOrders?: number;
  business?: 'pending' | 'approved';
}

export interface ApplyBusinessDto {
  companyName: string;
  companyInn: string;
}

export interface SetBusinessDto {
  approved: boolean;
  creditDays?: number;
  creditLimit?: number;
}

export interface UpdateCustomerDto {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  defaultAddressId?: Id | null;
  marketingOptIn?: boolean;
}
