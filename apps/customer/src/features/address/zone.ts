/**
 * Whether the platform delivers to a point at all — said on the home screen and while the pin
 * moves, not first at checkout. The zones are the API's (GET /geo/zones/resolve); null while asking
 * or when no answer came, so a flaky network never shows a warning on a guess.
 */
import { api } from '@bazar/mobile';
import type { LatLngDto } from '@bazar/types';
import { useEffect, useState } from 'react';

/** ~10 m: a pin nudged across the street asks once. */
const keyOf = (point: LatLngDto) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
const answers = new Map<string, boolean>();

export function useDeliverable(point: LatLngDto | null | undefined): boolean | null {
  const key = point ? keyOf(point) : null;
  const [deliverable, setDeliverable] = useState<boolean | null>(
    key === null ? null : (answers.get(key) ?? null),
  );
  useEffect(() => {
    if (key === null || !point) return setDeliverable(null);
    const known = answers.get(key);
    if (known !== undefined) return setDeliverable(known);
    setDeliverable(null);
    let live = true;
    api()
      .geo.resolveZone({ lat: point.lat, lng: point.lng })
      .then((answer) => {
        answers.set(key, answer.deliverable);
        if (live) setDeliverable(answer.deliverable);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // The key is the point, rounded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return deliverable;
}
