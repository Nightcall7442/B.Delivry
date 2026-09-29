/**
 * Orders as the API knows them. The list is a query; a single order is a query
 * plus a websocket room, so status and courier position move without polling.
 */
import { room } from '@bazar/api-client';
import { CUSTOMER_CANCELLABLE_STATUSES, isTerminalOrderStatus } from '@bazar/constants';
import { api, useAuth } from '@bazar/mobile';
import type { CourierPublicDto, LatLngDto, OrderDto, OrderTrackingDto } from '@bazar/types';
import { WS_EVENT } from '@bazar/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** The history view reads up to this many pages of 100; the home banner only needs the newest 50. */
const HISTORY_PAGES = 3;

export function useOrderList(options: { history?: boolean } = {}): {
  orders: OrderDto[];
  ready: boolean;
  /** Resolves when the fresh list is in, so a pull-to-refresh spinner lasts as long as the fetch. */
  reload: () => Promise<void>;
} {
  const history = options.history === true;
  const { user, ready: authReady } = useAuth();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const waiting = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setOrders([]);
      setReady(true);
      return;
    }
    let alive = true;
    const pageSize = history ? 100 : 50;
    api()
      .orders.list({ pageSize })
      .then(async (first) => {
        // Newest first: the extra pages are older history, fetched together.
        const more = history
          ? await Promise.all(
              Array.from(
                { length: Math.min(first.pagination.totalPages, HISTORY_PAGES) - 1 },
                (_, index) => api().orders.list({ pageSize, page: index + 2 }),
              ),
            )
          : [];
        return [first, ...more].flatMap((page) => page.items);
      })
      .then((items) => alive && setOrders(items))
      .catch(() => alive && setOrders([]))
      .finally(() => {
        if (alive) setReady(true);
        for (const done of waiting.current.splice(0)) done();
      });
    return () => {
      alive = false;
    };
  }, [user, authReady, tick, history]);

  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        setTick((t) => t + 1);
      }),
    [],
  );

  return { orders, ready, reload };
}

/** The newest order still in flight — what the home banner shows. */
export function useActiveOrder(): OrderDto | null {
  const { orders } = useOrderList();
  return useMemo(
    () => orders.find((order) => !isTerminalOrderStatus(order.status)) ?? null,
    [orders],
  );
}

export interface LiveOrder {
  order: OrderDto | null;
  courier: LatLngDto | null;
  courierInfo: CourierPublicDto | null;
  etaMinutes: number | null;
  cancellable: boolean;
  ready: boolean;
  cancel: (reason: string) => Promise<void>;
}

export function useLiveOrder(orderId: string): LiveOrder {
  const { user, ready: authReady } = useAuth();
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [tracking, setTracking] = useState<OrderTrackingDto | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [fetched, live] = await Promise.all([
      api().orders.get(orderId),
      api()
        .tracking.order(orderId)
        .catch(() => null),
    ]);
    setOrder(fetched);
    setTracking(live);
  }, [orderId]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setReady(true);
      return;
    }
    let alive = true;
    load()
      .catch(() => alive && setOrder(null))
      .finally(() => alive && setReady(true));

    const realtime = api().realtime;
    void realtime.connect();
    realtime.join(room.order(orderId));
    const offStatus = realtime.on(WS_EVENT.ORDER_STATUS_CHANGED, (event) => {
      if (event.orderId === orderId) void load();
    });
    const offPayment = realtime.on(WS_EVENT.ORDER_PAYMENT_UPDATED, (event) => {
      if (event.orderId === orderId) void load();
    });
    const offRepriced = realtime.on(WS_EVENT.ORDER_REPRICED, (event) => {
      if (event.orderId === orderId) void load();
    });
    const offEta = realtime.on(WS_EVENT.ORDER_ETA_UPDATED, (event) => {
      if (event.orderId !== orderId) return;
      setTracking((current) =>
        current ? { ...current, etaAt: event.etaAt, etaSeconds: event.etaSeconds } : current,
      );
    });
    const offLocation = realtime.on(WS_EVENT.COURIER_LOCATION, (event) => {
      if (event.orderId !== orderId) return;
      setTracking((current) =>
        current ? { ...current, courierPoint: event.point, courierUpdatedAt: event.at } : current,
      );
    });
    // The app was in the background: the socket may have missed a transition.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => {
      alive = false;
      offStatus();
      offPayment();
      offRepriced();
      offEta();
      offLocation();
      realtime.leave(room.order(orderId));
      appState.remove();
    };
  }, [orderId, user, authReady, load]);

  const cancel = useCallback(
    async (reason: string) => {
      const updated = await api().orders.cancel(orderId, { reason });
      setOrder(updated);
    },
    [orderId],
  );

  const etaMinutes = useMemo(() => {
    if (!order || isTerminalOrderStatus(order.status)) return null;
    const at = tracking?.etaAt ?? order.etaAt;
    if (!at) return null;
    return Math.max(1, Math.ceil((Date.parse(at) - Date.now()) / 60_000));
  }, [order, tracking]);

  return {
    order,
    courier: tracking?.courierPoint ?? null,
    courierInfo: tracking?.courier ?? null,
    etaMinutes,
    cancellable: order ? CUSTOMER_CANCELLABLE_STATUSES.includes(order.status) : false,
    ready,
    cancel,
  };
}
