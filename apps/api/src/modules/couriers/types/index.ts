/**
 * Couriers module-internal types & DTOs.
 */
import type { CourierStatus, VehicleType } from '@bazar/constants';

export interface CourierListFilters {
  cityId?: string | undefined;
  status?: CourierStatus | undefined;
  vehicleType?: VehicleType | undefined;
  onlineOnly?: boolean | undefined;
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface CourierShift {
  status: CourierStatus;
  since: Date;
  todayOrders: number;
  todayEarnings: number;
  currency: string;
}

export interface RegisterCourierInput {
  userId: string;
  cityId: string;
  vehicleType: VehicleType;
  plateNumber?: string | undefined;
  maxConcurrentOrders?: number | undefined;
}
