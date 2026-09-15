/**
 * Couriers request/response Zod schemas (reuse @bazar/validation where shared).
 */
import { COURIER_STATUS, UZ_PLATE_REGEX, VEHICLE_TYPE } from '@bazar/constants';
import { idSchema, listQuerySchema } from '@bazar/validation';
import { z } from 'zod';

export const courierIdParamsSchema = z.object({ id: idSchema });

export const couriersListQuerySchema = listQuerySchema.extend({
  cityId: idSchema.optional(),
  status: z.nativeEnum(COURIER_STATUS).optional(),
  vehicleType: z.nativeEnum(VEHICLE_TYPE).optional(),
  onlineOnly: z.coerce.boolean().optional(),
});

/** Couriers set their own status; SUSPENDED is a staff decision only. */
export const setCourierStatusSchema = z.object({
  status: z.enum([COURIER_STATUS.ONLINE, COURIER_STATUS.OFFLINE, COURIER_STATUS.BUSY]),
});

export const registerCourierSchema = z.object({
  userId: idSchema,
  cityId: idSchema,
  vehicleType: z.nativeEnum(VEHICLE_TYPE),
  plateNumber: z.string().trim().regex(UZ_PLATE_REGEX).optional(),
  maxConcurrentOrders: z.coerce.number().int().min(1).max(5).optional(),
});

export const updateCourierSchema = z.object({
  vehicleType: z.nativeEnum(VEHICLE_TYPE).optional(),
  plateNumber: z.string().trim().regex(UZ_PLATE_REGEX).optional(),
  maxConcurrentOrders: z.coerce.number().int().min(1).max(5).optional(),
});

export type CouriersListQuery = z.infer<typeof couriersListQuerySchema>;
