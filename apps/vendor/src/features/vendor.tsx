/**
 * The stall's side of the day: which stalls the signed-in vendor keeps, their orders, and the alert
 * for an order nobody has looked at yet.
 *
 * New orders reach the app two ways, and neither is trusted alone: the socket room of a stall
 * pushes `store.new_order`, and a short poll reads the lists anyway (a push that arrives while the
 * socket is reconnecting is lost for good). An order is «heard» once it has been acknowledged; until
 * then the phone vibrates and the banner stays on top — for ANY of the vendor's stalls, not only the
 * one on screen.
 */
import { room } from '@bazar/api-client';
import { api, useAuth } from '@bazar/mobile';
import { unseenOrders } from '@bazar/storefront';
import { ORDER_STATUS } from '@bazar/constants';
import { WS_EVENT, type OrderDto, type StoreDto } from '@bazar/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Vibration } from 'react-native';

const SEEN_KEY = 'bazar.vendor.seen';
const SEEN_LIMIT = 300;
const POLL_SECONDS = 6;
/** A failed start (no signal at the bazaar) is tried again until the stalls are known. */
const STORES_RETRY_SECONDS = 8;
/** Buzz, pause, buzz — repeated until somebody answers. */
const RING_PATTERN = [0, 700, 350, 700, 350];

export interface VendorApi {
  /** The stalls are known: screens may stop showing a skeleton (a failed load keeps retrying). */
  ready: boolean;
  stores: StoreDto[];
  /** The stall on the screen: the first of the vendor's stalls until they pick another. */
  store: StoreDto | null;
  selectStore: (id: string) => void;
  /** Re-read the stalls (hours, photograph, stock-dependent flags) after an edit. */
  reloadStore: () => Promise<void>;
  /** The latest orders of the stall on screen, newest first. */
  orders: OrderDto[];
  ordersReady: boolean;
  /** The last read of the orders failed: what is on screen may be stale. */
  ordersFailed: boolean;
  reloadOrders: () => Promise<void>;
  /** Orders waiting for the stall's answer across ALL its stalls (the tab badge). */
  waiting: number;
  /** The order that has not been acknowledged yet, oldest first, of any stall; null when up to date. */
  ringing: OrderDto | null;
  /** The stall has seen this order: the vibration and the banner stop for it. */
  acknowledge: (orderId: string) => void;
}

const VendorContext = createContext<VendorApi | null>(null);

export function VendorProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [ready, setReady] = useState(false);
  const [storesTick, setStoresTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [allOrders, setAllOrders] = useState<OrderDto[]>([]);
  const [ordersReady, setOrdersReady] = useState(false);
  const [ordersFailed, setOrdersFailed] = useState(false);
  // Null until the stored ids are read: nothing rings before the stall's memory is known.
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);

  const store = useMemo(
    () => stores.find((row) => row.id === selectedId) ?? stores[0] ?? null,
    [stores, selectedId],
  );
  const storeId = store?.id ?? null;
  const storesRef = useRef<StoreDto[]>([]);
  storesRef.current = stores;
  const storeIdRef = useRef<string | null>(null);
  storeIdRef.current = storeId;

  const reloadStore = useCallback(async () => {
    if (!user) return;
    setStores(await api().stores.mine());
  }, [user]);

  useEffect(() => {
    if (!user) {
      setStores([]);
      setAllOrders([]);
      setReady(false);
      setOrdersReady(false);
      return;
    }
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    api()
      .stores.mine()
      .then((rows) => {
        if (!alive) return;
        setStores(rows);
        setReady(true);
      })
      .catch(() => {
        // Not «no stall»: the answer never came. Try again until it does.
        if (alive)
          retry = setTimeout(() => setStoresTick((tick) => tick + 1), STORES_RETRY_SECONDS * 1000);
      });
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
    };
  }, [user, storesTick]);

  // Every stall of the vendor, in a fixed number of requests however many stalls there are (the poll
  // runs every few seconds, and the API allows 100 requests a minute per account: two per stall would
  // spend all of it at five stalls). The server scopes `as: 'store'` to the account's own stalls.
  // Active orders in one request (an old order still waiting must not fall out of a window of newer
  // finished ones), the latest of all stalls in another, the latest of the stall on screen in a third
  // (a busy neighbour must not crowd its history out).
  const reloadOrders = useCallback(async () => {
    if (storesRef.current.length === 0) return;
    const onScreen = storeIdRef.current;
    try {
      const pages = await Promise.all([
        api().orders.list({ as: 'store', activeOnly: true, pageSize: 100 }),
        api().orders.list({ as: 'store', pageSize: 50 }),
        ...(onScreen === null
          ? []
          : [api().orders.list({ as: 'store', storeId: onScreen, pageSize: 50 })]),
      ]);
      const byId = new Map<string, OrderDto>();
      for (const page of pages) for (const order of page.items) byId.set(order.id, order);
      setAllOrders(
        [...byId.values()].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt)),
      );
      setOrdersFailed(false);
    } catch (error) {
      setOrdersFailed(true);
      throw error;
    } finally {
      setOrdersReady(true);
    }
  }, []);

  // The lists: read now, then every few seconds while the app is in front.
  const storeKey = stores.map((row) => row.id).join(',');
  useEffect(() => {
    setAllOrders([]);
    setOrdersReady(false);
    setOrdersFailed(false);
    if (!storeKey) return;
    const load = () => void reloadOrders().catch(() => undefined);
    load();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, POLL_SECONDS * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [storeKey, reloadOrders]);

  // Another stall on screen: its own latest orders are read now, not at the next poll.
  useEffect(() => {
    if (storeId !== null) void reloadOrders().catch(() => undefined);
  }, [storeId, reloadOrders]);

  // The socket: a new order is heard the moment it is placed, not at the next poll.
  useEffect(() => {
    if (!user || stores.length === 0) return;
    const realtime = api().realtime;
    void realtime.connect();
    for (const row of stores) realtime.join(room.store(row.id));
    const off = realtime.on(
      WS_EVENT.STORE_NEW_ORDER,
      () => void reloadOrders().catch(() => undefined),
    );
    return () => {
      off();
      for (const row of stores) realtime.leave(room.store(row.id));
      realtime.close();
    };
  }, [user, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the stall has already been told about survives a restart.
  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        try {
          const ids = raw ? (JSON.parse(raw) as unknown) : [];
          setSeen(
            new Set(
              Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
            ),
          );
        } catch {
          setSeen(new Set());
        }
      })
      .catch(() => setSeen(new Set()));
  }, []);

  const acknowledge = useCallback((orderId: string) => {
    setSeen((current) => {
      const next = new Set(current ?? []);
      next.add(orderId);
      const kept = [...next].slice(-SEEN_LIMIT);
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(kept)).catch(() => undefined);
      return new Set(kept);
    });
  }, []);

  const orders = useMemo(
    () => allOrders.filter((order) => order.storeId === storeId),
    [allOrders, storeId],
  );
  const waiting = useMemo(
    () => allOrders.filter((order) => order.status === ORDER_STATUS.PENDING).length,
    [allOrders],
  );
  const ringing = useMemo(
    () => (seen === null ? null : (unseenOrders(allOrders, seen)[0] ?? null)),
    [allOrders, seen],
  );

  // Until somebody answers the phone keeps buzzing (a counter at a bazaar is loud).
  const ringingId = ringing?.id ?? null;
  useEffect(() => {
    if (ringingId === null) return;
    Vibration.vibrate(RING_PATTERN, true);
    return () => Vibration.cancel();
  }, [ringingId]);

  const value = useMemo<VendorApi>(
    () => ({
      ready,
      stores,
      store,
      selectStore: setSelectedId,
      reloadStore,
      orders,
      ordersReady,
      ordersFailed,
      reloadOrders,
      waiting,
      ringing,
      acknowledge,
    }),
    [
      ready,
      stores,
      store,
      reloadStore,
      orders,
      ordersReady,
      ordersFailed,
      reloadOrders,
      waiting,
      ringing,
      acknowledge,
    ],
  );

  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

export function useVendor(): VendorApi {
  const context = useContext(VendorContext);
  if (!context) throw new Error('useVendor must be used inside <VendorProvider>');
  return context;
}
