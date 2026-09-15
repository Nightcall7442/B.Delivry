/**
 * Orders as the API knows them. The list is a query; a single order is a query
 * plus a websocket room, so status and courier position move without polling.
 */
'use client';

import { room } from '@bazar/api-client';
import { CUSTOMER_CANCELLABLE_STATUSES, isTerminalOrderStatus } from '@bazar/constants';
import type { CourierPublicDto, LatLngDto, OrderDto, OrderTrackingDto } from '@bazar/types';
import { WS_EVENT } from '@bazar/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

export function useOrderList(): { orders: OrderDto[]; ready: boolean; reload: () => void } {
  const { user, ready: authReady } = useAuth();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setOrders([]);
      setReady(true);
      return;
    }
    let alive = true;
    api()
      .orders.list({ pageSize: 50 })
      .then((page) => alive && setOrders(page.items))
      .catch(() => alive && setOrders([]))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [user, authReady, tick]);

  return { orders, ready, reload: useCallback(() => setTick((t) => t + 1), []) };
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
    // The tab was in the background: the socket may have missed a transition.
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      offStatus();
      offPayment();
      offRepriced();
      offEta();
      offLocation();
      realtime.leave(room.order(orderId));
      window.removeEventListener('focus', onFocus);
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
