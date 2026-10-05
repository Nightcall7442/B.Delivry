/**
 * The order on the screen: from the stall's list while it is there (the poll keeps it fresh), else
 * read by id — an older order, or one opened from a link. A copy the stall changed itself (the
 * answer to «Принять») wins over the list until the list catches up.
 */
import { isApiError } from '@bazar/api-client';
import { api } from '@bazar/mobile';
import { freshest, vendorErrorText } from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useVendor } from '@/features/vendor';

export function useOrder(orderId: string) {
  const { orders } = useVendor();
  const listed = useMemo(() => orders.find((row) => row.id === orderId) ?? null, [orders, orderId]);
  const [fetched, setFetched] = useState<OrderDto | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Gone (or never this stall's): trying again cannot help, the way out is back to the list.
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    setMissing(false);
    try {
      setFetched(await api().orders.get(orderId));
    } catch (cause) {
      setMissing(isApiError(cause) && cause.status === 404);
      setFailure(vendorErrorText(cause));
    }
  }, [orderId]);

  const inList = listed !== null;
  useEffect(() => {
    if (!inList) void load();
  }, [inList, load]);

  const order = freshest(listed, fetched?.id === orderId ? fetched : null);
  return {
    order,
    failure: order ? null : failure,
    missing: order === null && missing,
    reload: load,
    adopt: setFetched,
  };
}
