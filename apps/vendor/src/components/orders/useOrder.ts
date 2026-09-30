/**
 * The order on the screen: from the stall's list while it is there (the poll keeps it fresh), else
 * read by id — an older order, or one opened from a link. A copy the stall changed itself (the
 * answer to «Принять») wins over the list until the list catches up.
 */
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

  const load = useCallback(async () => {
    setFailure(null);
    try {
      setFetched(await api().orders.get(orderId));
    } catch (cause) {
      setFailure(vendorErrorText(cause));
    }
  }, [orderId]);

  const inList = listed !== null;
  useEffect(() => {
    if (!inList) void load();
  }, [inList, load]);

  const order = freshest(listed, fetched?.id === orderId ? fetched : null);
  return { order, failure: order ? null : failure, reload: load, adopt: setFetched };
}
