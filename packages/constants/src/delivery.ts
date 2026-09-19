/**
 * Delivery constants: vehicle types, proof types, timeouts.
 */
export const VEHICLE_TYPE = {
  FOOT: 'FOOT',
  BICYCLE: 'BICYCLE',
  SCOOTER: 'SCOOTER',
  MOTORBIKE: 'MOTORBIKE',
  CAR: 'CAR',
  VAN: 'VAN',
} as const;

export type VehicleType = (typeof VEHICLE_TYPE)[keyof typeof VEHICLE_TYPE];

/** Grams a courier can carry per vehicle: filters candidates by order weight. */
/** From this weight (a sack of flour, two bottles of water) the order needs a car and pays for it. */
export const HEAVY_ORDER_GRAMS = 15_000;
export const HEAVY_VEHICLES: readonly VehicleType[] = ['CAR', 'VAN'];
/** Added to the delivery fee of a heavy order, minor units (15 000 сум). */
export const HEAVY_SURCHARGE_MINOR = 15_000_00;

export const VEHICLE_CAPACITY_GRAMS: Record<VehicleType, number> = {
  FOOT: 8_000,
  BICYCLE: 15_000,
  SCOOTER: 25_000,
  MOTORBIKE: 40_000,
  CAR: 300_000,
  VAN: 1_000_000,
};

/** Rough city speed in km/h. The MapProvider overrides this whenever it can route. */
export const VEHICLE_AVG_SPEED_KMH: Record<VehicleType, number> = {
  FOOT: 5,
  BICYCLE: 14,
  SCOOTER: 22,
  MOTORBIKE: 28,
  CAR: 25,
  VAN: 22,
};

export const DELIVERY_STATUS = {
  PENDING: 'PENDING',
  SEARCHING: 'SEARCHING',
  ASSIGNED: 'ASSIGNED',
  AT_PICKUP: 'AT_PICKUP',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_DROPOFF: 'AT_DROPOFF',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type DeliveryStatus = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

export const PROOF_TYPE = {
  PHOTO: 'PHOTO',
  SIGNATURE: 'SIGNATURE',
  CODE: 'CODE',
  NONE: 'NONE',
} as const;

export type ProofType = (typeof PROOF_TYPE)[keyof typeof PROOF_TYPE];

export const DELIVERY_TIMEOUTS = {
  /** How long one courier has to accept an offer before it moves on. */
  OFFER_TTL_SECONDS: 30,
  /** Give up the automatic search and hand the order to an operator. */
  COURIER_SEARCH_TTL_SECONDS: 600,
  /** Location fixes older than this are not drawn on the live map. */
  LOCATION_STALE_SECONDS: 120,
  /** Minimum gap between accepted location pings from one courier. */
  LOCATION_MIN_INTERVAL_SECONDS: 5,
  /** Courier counts as arrived inside this radius. */
  ARRIVAL_RADIUS_METERS: 100,
} as const;
