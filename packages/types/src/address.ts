/**
 * address types / DTOs.
 */
import type { Id, LatLngDto, TenantEntity } from './common.js';

export const ADDRESS_LABEL = {
  HOME: 'HOME',
  WORK: 'WORK',
  OTHER: 'OTHER',
} as const;

export type AddressLabel = (typeof ADDRESS_LABEL)[keyof typeof ADDRESS_LABEL];

/**
 * Uzbek addressing is landmark-driven: many mahallas have unsigned streets, so
 * `landmark` and `instructions` matter as much as the house number.
 */
export interface AddressDto extends TenantEntity {
  customerId: Id;
  label: AddressLabel;
  title: string | null;
  cityId: Id;
  districtId: Id | null;
  mahallaId: Id | null;
  street: string | null;
  house: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  intercom: string | null;
  landmark: string | null;
  instructions: string | null;
  point: LatLngDto | null;
  isDefault: boolean;
}

export interface CreateAddressDto {
  label?: AddressLabel;
  title?: string;
  cityId: Id;
  districtId?: Id;
  mahallaId?: Id;
  street?: string;
  house?: string;
  apartment?: string;
  entrance?: string;
  floor?: string;
  intercom?: string;
  landmark?: string;
  instructions?: string;
  point?: LatLngDto;
  isDefault?: boolean;
}

export type UpdateAddressDto = Partial<CreateAddressDto>;

/** Address as copied onto an order: frozen, so later edits do not rewrite history. */
export interface OrderAddressDto {
  cityId: Id;
  formatted: string;
  street: string | null;
  house: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  landmark: string | null;
  instructions: string | null;
  point: LatLngDto | null;
}
