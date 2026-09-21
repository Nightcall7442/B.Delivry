/**
 * The three bazaars the couriers ride from, as the address sheet quotes them:
 * where each is and how long a stall there takes to weigh and pack.
 * The stalls in catalog-data stand at these points; once an order exists the
 * API's tariff is the truth, this is the board a customer reads before that.
 */
import type { LatLngDto } from '@bazar/types';

import { estimateDelivery, type DeliveryEstimate } from './pricing.js';

export interface Bazaar {
  key: 'chorsu' | 'alay' | 'farhad';
  name: { ru: string; uz: string };
  point: LatLngDto;
  /** Minutes a stall there needs before the courier leaves — the rows' usual `prep`. */
  prepMinutes: number;
  /** A photo of its rows (PHOTOS key). */
  photo: string;
}

export const BAZAARS: readonly Bazaar[] = [
  {
    key: 'chorsu',
    name: { ru: 'Чорсу', uz: 'Chorsu' },
    point: { lat: 41.3266, lng: 69.2347 },
    prepMinutes: 20,
    photo: 'chorsu-zelen',
  },
  {
    key: 'alay',
    name: { ru: 'Алайский', uz: 'Oloy' },
    point: { lat: 41.312, lng: 69.286 },
    prepMinutes: 25,
    photo: 'alay-fruits',
  },
  {
    key: 'farhad',
    name: { ru: 'Фархадский', uz: 'Farhod' },
    point: { lat: 41.283, lng: 69.205 },
    prepMinutes: 30,
    photo: 'farhad-meat',
  },
];

/** Every bazaar's ride to a door, nearest first. */
export function tripsTo(door: LatLngDto): Array<{ bazaar: Bazaar; trip: DeliveryEstimate }> {
  return BAZAARS.map((bazaar) => ({
    bazaar,
    trip: estimateDelivery(bazaar.point, door, bazaar.prepMinutes),
  })).sort((a, b) => a.trip.distanceMeters - b.trip.distanceMeters);
}
