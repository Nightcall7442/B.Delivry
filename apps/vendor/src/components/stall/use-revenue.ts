/**
 * What the stall sold today and over the last seven days, from the API's sales report.
 *
 * Only the report's totals are read. Its daily series is computed over the whole bazaar, not the
 * stall, so it is never shown.
 */
import { api } from '@bazar/mobile';
import { revenueWindows } from '@bazar/storefront';
import type { Currency } from '@bazar/constants';
import type { SalesReportDto, VendorPayoutDto } from '@bazar/types';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Tally {
  /** Delivered orders placed in the window. */
  orders: number;
  /** Their cheques in full, minor units. */
  revenue: number;
  currency: Currency;
}

export interface Revenue {
  today: Tally;
  week: Tally;
  /** What the platform owes the stall; null when it could not be read (the rest still shows). */
  payout: VendorPayoutDto | null;
}

const tally = ({ orders, revenue }: SalesReportDto): Tally => ({
  orders,
  revenue: revenue.amount,
  currency: revenue.currency,
});

export function useRevenue(storeId: string | null) {
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [failed, setFailed] = useState(false);
  // The answer to the latest request wins: a slow first try must not overwrite a fresh pull.
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!storeId) return;
    const mine = ++latest.current;
    setFailed(false);
    try {
      const { today, week } = revenueWindows();
      const [day, seven, payout] = await Promise.all([
        api().analytics.sales({ storeId, ...today }),
        api().analytics.sales({ storeId, ...week }),
        api()
          .vendors.payout()
          .catch(() => null),
      ]);
      if (mine === latest.current) setRevenue({ today: tally(day), week: tally(seven), payout });
    } catch {
      // A failed refresh keeps the last numbers; the card says they may be old.
      if (mine === latest.current) setFailed(true);
    }
  }, [storeId]);

  useEffect(() => {
    latest.current++;
    setRevenue(null);
    setFailed(false);
  }, [storeId]);

  // The tab stays mounted while another is open: come back to the day as it is now.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { revenue, failed, reload };
}
