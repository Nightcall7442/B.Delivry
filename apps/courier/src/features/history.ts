/**
 * What the history screen shows: the courier's own numbers and the trips the
 * API will hand over, loaded together so the screen never mixes a profile from
 * one moment with trips from another.
 */
import { api, useAuth } from '@bazar/mobile';
import type { CourierDto, CourierShiftDto, DeliveryDto } from '@bazar/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The API's page ceiling. */
const PAGE_SIZE = 100;
/** Five pages are weeks of work; beyond them the totals say «последние N», never «всего». */
const MAX_PAGES = 5;

export interface HistoryData {
  courier: CourierDto;
  shift: CourierShiftDto;
  /** Newest first, every status: the caller keeps what is over. */
  trips: DeliveryDto[];
  /** The courier has more trips than were loaded. */
  truncated: boolean;
  /** When this was loaded: «сегодня» and the seven days are counted from here. */
  at: Date;
}

/** The first page tells how many there are; the rest come together, not one round trip each. */
async function loadTrips(): Promise<Pick<HistoryData, 'trips' | 'truncated'>> {
  const list = (page: number) => api().delivery.list({ page, pageSize: PAGE_SIZE });
  const first = await list(1);
  const { totalPages } = first.pagination;
  const rest = await Promise.all(
    Array.from({ length: Math.min(totalPages, MAX_PAGES) - 1 }, (_, i) => list(i + 2)),
  );
  return {
    trips: [first, ...rest].flatMap((page) => page.items),
    truncated: totalPages > MAX_PAGES,
  };
}

export function useHistory() {
  const { user } = useAuth();
  const [data, setData] = useState<HistoryData | null>(null);
  const [failed, setFailed] = useState(false);
  // The answer to the latest request wins: a slow first try must not overwrite a fresh pull.
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++latest.current;
    setFailed(false);
    try {
      const [courier, shift, loaded] = await Promise.all([
        api().couriers.me(),
        api().couriers.shift(),
        loadTrips(),
      ]);
      if (mine === latest.current) setData({ courier, shift, ...loaded, at: new Date() });
    } catch {
      // A failed refresh keeps what is on screen; the screen decides what a failure means.
      if (mine === latest.current) setFailed(true);
    }
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (userId !== undefined) void reload();
  }, [userId, reload]);

  return { data, failed, reload };
}
