/**
 * Addresses module-internal types & DTOs.
 */
export interface AddressInput {
  label?: 'HOME' | 'WORK' | 'OTHER';
  title?: string | undefined;
  cityId: string;
  districtId?: string | undefined;
  mahallaId?: string | undefined;
  street?: string | undefined;
  house?: string | undefined;
  apartment?: string | undefined;
  entrance?: string | undefined;
  floor?: string | undefined;
  intercom?: string | undefined;
  landmark?: string | undefined;
  instructions?: string | undefined;
  point?: { lat: number; lng: number } | undefined;
  isDefault?: boolean;
}

/** The address as frozen onto an order. */
export interface FrozenAddress {
  cityId: string;
  formatted: string;
  street: string | null;
  house: string | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  landmark: string | null;
  instructions: string | null;
  lat: number | null;
  lng: number | null;
}
