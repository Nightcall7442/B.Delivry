/**
 * Distance/format helpers (re-export from @bazar/maps if needed).
 */
export { haversineMeters, pointInPolygon, bearing } from '@bazar/maps';

/** 850 -> "850 m", 4200 -> "4.2 km". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** 95 -> "2 min", 3900 -> "1 h 5 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
