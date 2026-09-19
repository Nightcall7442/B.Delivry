/**
 * CourierMatchingStrategy interface (nearest / rating-weighted / broadcast). Implementations later.
 */
import { haversineMeters } from '@bazar/maps';
import {
  DELIVERY_TIMEOUTS,
  HEAVY_ORDER_GRAMS,
  HEAVY_VEHICLES,
  VEHICLE_AVG_SPEED_KMH,
  VEHICLE_CAPACITY_GRAMS,
} from '@bazar/constants';
import type { CourierCandidate, ScoredCandidate, SearchContext } from '../types/index.js';

export interface CourierMatchingStrategy {
  readonly id: string;
  /** Ranked, best first. An empty result means nobody suitable is nearby. */
  rank(candidates: readonly CourierCandidate[], context: SearchContext): ScoredCandidate[];
}

/** Seconds to reach the pickup at the vehicle's average city speed. */
function etaSeconds(candidate: CourierCandidate): number {
  const speedKmh = VEHICLE_AVG_SPEED_KMH[candidate.vehicleType];
  return Math.round((candidate.distanceMeters / 1000 / speedKmh) * 3600);
}

/**
 * Hard rules every strategy shares. These are not preferences: a courier who
 * fails one of them cannot do the job at all.
 */
function eligible(candidate: CourierCandidate, context: SearchContext, now: Date): boolean {
  if (context.excludeCourierIds.includes(candidate.courierId)) return false;
  if (candidate.activeOrderCount >= candidate.maxConcurrentOrders) return false;
  if (VEHICLE_CAPACITY_GRAMS[candidate.vehicleType] < context.weightGrams) return false;
  // Past the car threshold only a car or a van is offered the order, whatever the raw capacity says.
  if (context.weightGrams > HEAVY_ORDER_GRAMS && !HEAVY_VEHICLES.includes(candidate.vehicleType)) {
    return false;
  }
  // A neighbour delivers to their own mahalla, not across town.
  if (
    candidate.home !== null &&
    haversineMeters(candidate.home.point, context.dropoff) > candidate.home.radiusMeters
  ) {
    return false;
  }

  // A courier whose phone stopped reporting is not on the street any more,
  // whatever their status column says.
  const secondsSinceSeen = (now.getTime() - candidate.lastSeenAt.getTime()) / 1000;
  return secondsSinceSeen <= DELIVERY_TIMEOUTS.LOCATION_STALE_SECONDS;
}

/**
 * Closest courier wins. Predictable, and it is what keeps delivery times down
 * when there are plenty of couriers about.
 */
export class NearestCourierStrategy implements CourierMatchingStrategy {
  readonly id = 'nearest';

  rank(candidates: readonly CourierCandidate[], context: SearchContext): ScoredCandidate[] {
    const now = new Date();
    return candidates
      .filter((candidate) => eligible(candidate, context, now))
      .map((candidate) => ({
        ...candidate,
        etaSeconds: etaSeconds(candidate),
        // Lower distance is better, so the score is inverted for a common sort.
        score: 1 / (1 + candidate.distanceMeters),
      }))
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * Distance still dominates, but rating and current load break ties. This is
 * the default: a courier 200 m further away with a 4.9 rating and no other
 * order is a better outcome for the customer than the nearest one juggling two.
 */
export class RatingWeightedStrategy implements CourierMatchingStrategy {
  readonly id = 'rating-weighted';

  constructor(private readonly weights = { distance: 0.6, rating: 0.25, load: 0.15 }) {}

  rank(candidates: readonly CourierCandidate[], context: SearchContext): ScoredCandidate[] {
    const now = new Date();
    const eligibleCandidates = candidates.filter((candidate) => eligible(candidate, context, now));
    if (eligibleCandidates.length === 0) return [];

    const maxDistance = Math.max(...eligibleCandidates.map((c) => c.distanceMeters), 1);

    return eligibleCandidates
      .map((candidate) => {
        // Every term is normalized to 0..1 so the weights mean what they say.
        const distanceScore = 1 - candidate.distanceMeters / maxDistance;
        const ratingScore = candidate.rating / 5;
        const loadScore =
          1 - candidate.activeOrderCount / Math.max(1, candidate.maxConcurrentOrders);

        return {
          ...candidate,
          etaSeconds: etaSeconds(candidate),
          score:
            distanceScore * this.weights.distance +
            ratingScore * this.weights.rating +
            loadScore * this.weights.load,
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}

/**
 * Offers to everyone at once, first to accept takes it. Used as the fallback
 * when sequential offers have already timed out: at that point speed matters
 * more than picking the best courier.
 */
export class BroadcastStrategy implements CourierMatchingStrategy {
  readonly id = 'broadcast';

  rank(candidates: readonly CourierCandidate[], context: SearchContext): ScoredCandidate[] {
    const now = new Date();
    return candidates
      .filter((candidate) => eligible(candidate, context, now))
      .map((candidate) => ({ ...candidate, etaSeconds: etaSeconds(candidate), score: 1 }));
  }
}
