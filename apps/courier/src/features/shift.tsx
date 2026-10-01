/**
 * The courier's shift: online/offline, the offers arriving over the socket,
 * the one delivery in progress and the position stream behind all of it.
 *
 * Everything the server needs to know arrives through two channels — the
 * REST actions (accept, picked up, …) and the `location` socket command; the
 * server answers with `delivery.offer` / `delivery.offer_expired` events.
 */
import { isApiError } from '@bazar/api-client';
import { api, useAuth } from '@bazar/mobile';
import { mergeOffers } from '@bazar/storefront';
import {
  WS_EVENT,
  type CourierDto,
  type DeliveryDto,
  type DeliveryOfferDto,
  type LatLngDto,
} from '@bazar/types';
import * as Location from 'expo-location';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

export type Fix = LatLngDto & { heading?: number };

interface ShiftApi {
  courier: CourierDto | null;
  online: boolean;
  offers: DeliveryOfferDto[];
  active: DeliveryDto | null;
  /** Cross-bazaar: the other stalls of the same trip — one card, one set of steps. */
  siblings: DeliveryDto[];
  position: Fix | null;
  /** True while a status change or delivery action is in flight. */
  busy: boolean;
  error: string | null;
  setOnline: (online: boolean) => Promise<void>;
  accept: (offer: DeliveryOfferDto) => Promise<void>;
  decline: (offer: DeliveryOfferDto) => Promise<void>;
  /** The one button on the active card: whatever the next step is. */
  advance: (handoverCode?: string) => Promise<void>;
  /** At the pickup and nothing to collect: the order fails with the reason, money goes back. */
  fail: (reason: string) => Promise<void>;
  reload: () => Promise<void>;
}

const ShiftContext = createContext<ShiftApi | null>(null);

/** The active deliveries that belong to the first one's cross-bazaar group. */
async function groupSiblings(deliveries: DeliveryDto[]): Promise<DeliveryDto[]> {
  const [lead, ...rest] = deliveries;
  if (!lead || rest.length === 0) return [];
  const orders = await Promise.all(
    deliveries.map((d) =>
      api()
        .orders.get(d.orderId)
        .catch(() => null),
    ),
  );
  const groupId = orders[0]?.groupId ?? null;
  if (groupId === null) return [];
  return rest.filter((_, index) => orders[index + 1]?.groupId === groupId);
}

/** Seconds between position reports while online. */
const PING_SECONDS = 4;
/** A parked phone sends nothing on its own; the server drops a courier silent for two minutes. */
const HEARTBEAT_SECONDS = 30;
/**
 * The socket pushes offers, but one that is reconnecting when an offer goes out loses it for good
 * (an offer lives thirty seconds), so a courier on shift also asks the server for the open ones.
 */
const OFFER_POLL_SECONDS = 4;

export function ShiftProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [courier, setCourier] = useState<CourierDto | null>(null);
  const [offers, setOffers] = useState<DeliveryOfferDto[]>([]);
  const [active, setActive] = useState<DeliveryDto | null>(null);
  const [siblings, setSiblings] = useState<DeliveryDto[]>([]);
  const [position, setPosition] = useState<Fix | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Offers turned down: a poll already in flight may still list them.
  const dismissed = useRef(new Set<string>());

  const online = courier?.status === 'ONLINE' || courier?.status === 'BUSY';

  const reload = useCallback(async () => {
    if (!user) {
      setCourier(null);
      setActive(null);
      return;
    }
    let me: CourierDto;
    try {
      me = await api().couriers.me();
    } catch (cause) {
      // A neighbour the desk has just verified still holds the token from before: it names no courier
      // yet. Take a fresh pair (it carries the profile now) and ask again, instead of waiting it out.
      if (!isApiError(cause) || cause.status !== 403 || !(await api().http.renew())) throw cause;
      me = await api().couriers.me();
    }
    const deliveries = await api().delivery.active();
    setCourier(me);
    setActive(deliveries[0] ?? null);
    setSiblings(await groupSiblings(deliveries));
  }, [user]);

  // A failed load keeps the last known state; a retry follows when the app
  // comes back to the foreground or the user flips the switch.
  useEffect(() => {
    reload().catch(() => undefined);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload().catch(() => undefined);
    });
    return () => sub.remove();
  }, [reload]);

  // Socket: offers in, positions out. Connected only while there is a signed-in courier.
  useEffect(() => {
    if (!courier) return;
    const realtime = api().realtime;
    void realtime.connect();
    const offOffer = realtime.on(WS_EVENT.DELIVERY_OFFER, (offer) => {
      setOffers((current) => mergeOffers(current, [offer], dismissed.current));
    });
    const offExpired = realtime.on(WS_EVENT.DELIVERY_OFFER_EXPIRED, ({ deliveryId }) => {
      setOffers((current) => current.filter((o) => o.deliveryId !== deliveryId));
    });
    const offAssigned = realtime.on(WS_EVENT.DELIVERY_ASSIGNED, () => {
      setOffers([]);
      // A group follower may have been attached: reload the whole trip, not one card.
      reload().catch(() => undefined);
    });
    return () => {
      offOffer();
      offExpired();
      offAssigned();
      realtime.close();
    };
  }, [courier?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The socket's safety net: ask the server for the open offers every few seconds while on shift
  // with nothing in hand, and the moment the app comes back to the front.
  useEffect(() => {
    if (!online || active) return;
    let alive = true;
    const poll = () =>
      api()
        .delivery.offers()
        .then((open) => {
          if (alive) setOffers((current) => mergeOffers(current, open, dismissed.current));
        })
        .catch(() => undefined);
    void poll();
    const timer = setInterval(() => void poll(), OFFER_POLL_SECONDS * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void poll();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [online, active]);

  // Offers die on their own clock; drop them a second early so a tap never lands on a corpse.
  useEffect(() => {
    if (offers.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now() + 1000;
      setOffers((current) => current.filter((o) => Date.parse(o.expiresAt) > now));
    }, 1000);
    return () => clearInterval(timer);
  }, [offers.length]);

  // Position stream: the device's GPS on a phone, a simulated ride on the web build.
  const target = useMemo<LatLngDto | null>(() => {
    if (!active) return null;
    return active.status === 'ASSIGNED' || active.status === 'AT_PICKUP'
      ? active.pickupPoint
      : active.dropoffPoint;
  }, [active]);
  useLocationStream(online, target, active?.orderId ?? null, setPosition);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
      } catch (cause) {
        if (isApiError(cause) && cause.status === 409) {
          // The order moved under the courier (cancelled by the customer or the stall, closed by the
          // desk): the card is dead. Read the trip again so it clears instead of staying on screen.
          setError('Заказ уже изменился — обновили смену');
          reload().catch(() => undefined);
        } else {
          setError(cause instanceof Error ? cause.message : 'Что-то пошло не так');
        }
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const setOnline = useCallback(
    (next: boolean) =>
      run(async () => {
        if (next && Platform.OS !== 'web') {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') throw new Error('Без геолокации на смену не выйти');
        }
        setCourier(await api().couriers.setStatus(next ? 'ONLINE' : 'OFFLINE'));
        if (!next) setOffers([]);
        else setActive((await api().delivery.active())[0] ?? null);
      }),
    [run],
  );

  const accept = useCallback(
    (offer: DeliveryOfferDto) =>
      run(async () => {
        const delivery = await api().delivery.accept(offer.deliveryId, position ?? {});
        setActive(delivery);
        setOffers([]);
        setCourier(await api().couriers.me());
        setSiblings(await groupSiblings(await api().delivery.active()));
      }),
    [run, position],
  );

  const decline = useCallback(
    (offer: DeliveryOfferDto) =>
      run(async () => {
        dismissed.current.add(offer.deliveryId);
        setOffers((current) => current.filter((o) => o.deliveryId !== offer.deliveryId));
        await api().delivery.decline(offer.deliveryId);
      }),
    [run],
  );

  const advance = useCallback(
    (handoverCode?: string) =>
      run(async () => {
        if (!active) return;
        const delivery = api().delivery;
        const step = async (row: DeliveryDto, code: string | undefined) =>
          row.status === 'ASSIGNED'
            ? delivery.arrivedPickup(row.id)
            : row.status === 'AT_PICKUP'
              ? delivery.pickedUp(row.id)
              : row.status === 'PICKED_UP' || row.status === 'IN_TRANSIT'
                ? delivery.arrivedDropoff(row.id)
                : delivery.complete(row.id, {
                    ...(code ? { handoverCode: code } : {}),
                    ...(position ?? {}),
                  });
        const next = await step(active, handoverCode);
        // One trip: the sibling stalls take the same step (their own code on handover).
        const nextSiblings: DeliveryDto[] = [];
        for (const sibling of siblings) {
          const moved = await step(sibling, sibling.handoverCode ?? undefined).catch(() => sibling);
          if (moved.status !== 'DELIVERED' && moved.status !== 'FAILED') nextSiblings.push(moved);
        }
        setSiblings(nextSiblings);
        setActive(next.status === 'DELIVERED' || next.status === 'FAILED' ? null : next);
        if (next.status === 'DELIVERED') setCourier(await api().couriers.me());
      }),
    [run, active, siblings, position],
  );

  const fail = useCallback(
    (reason: string) =>
      run(async () => {
        if (!active) return;
        await api().delivery.fail(active.id, { reason });
        for (const sibling of siblings) {
          await api()
            .delivery.fail(sibling.id, { reason })
            .catch(() => undefined);
        }
        setSiblings([]);
        setActive(null);
        setCourier(await api().couriers.me());
      }),
    [run, active, siblings],
  );

  const value = useMemo<ShiftApi>(
    () => ({
      courier,
      online,
      offers,
      active,
      siblings,
      position,
      busy,
      error,
      setOnline,
      accept,
      decline,
      advance,
      fail,
      reload,
    }),
    [
      courier,
      online,
      offers,
      active,
      siblings,
      position,
      busy,
      error,
      setOnline,
      accept,
      decline,
      advance,
      fail,
      reload,
    ],
  );

  return <ShiftContext.Provider value={value}>{children}</ShiftContext.Provider>;
}

export function useShift(): ShiftApi {
  const context = useContext(ShiftContext);
  if (!context) throw new Error('useShift must be used inside <ShiftProvider>');
  return context;
}

/**
 * Reports the courier's position every few seconds while online. On a phone
 * that is expo-location; the web build has no useful GPS, so it rides a
 * straight line towards the current target at scooter speed — which is also
 * what makes the demo watchable from the customer's screen.
 */
function useLocationStream(
  online: boolean,
  target: LatLngDto | null,
  orderId: string | null,
  onFix: (fix: Fix) => void,
) {
  const last = useRef<Fix | null>(null);
  const targetRef = useRef(target);
  targetRef.current = target;
  const orderRef = useRef(orderId);
  orderRef.current = orderId;

  useEffect(() => {
    if (!online) return;
    const report = (fix: Fix) => {
      last.current = fix;
      onFix(fix);
      api().realtime.location({
        ...fix,
        recordedAt: new Date().toISOString(),
        ...(orderRef.current ? { orderId: orderRef.current } : {}),
      });
    };

    if (Platform.OS !== 'web') {
      let alive = true;
      let sentAt = 0;
      let subscription: Location.LocationSubscription | null = null;
      const send = (fix: Fix) => {
        sentAt = Date.now();
        report(fix);
      };
      const fromLocation = (location: Location.LocationObject): Fix => ({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        ...(location.coords.heading !== null && location.coords.heading >= 0
          ? { heading: location.coords.heading }
          : {}),
      });
      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: PING_SECONDS * 1000,
          distanceInterval: 10,
        },
        (location) => send(fromLocation(location)),
      )
        .then((sub) => {
          if (alive) subscription = sub;
          else sub.remove();
        })
        .catch(() => undefined);
      // On shift at once: a courier who has just gone online must not wait for the phone to move
      // before the first offer can reach them.
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((location) => {
          if (alive) send(fromLocation(location));
        })
        .catch(() => undefined);
      // Standing still is still a fix: `distanceInterval` keeps a parked phone silent, and a
      // courier silent for two minutes gets no offers.
      const heartbeat = setInterval(() => {
        if (last.current && Date.now() - sentAt > HEARTBEAT_SECONDS * 1000) send(last.current);
      }, 10_000);
      return () => {
        alive = false;
        clearInterval(heartbeat);
        subscription?.remove();
      };
    }

    // ponytail: straight-line ride at ~25 km/h; real routing lives on the server.
    const STEP_METERS = (25_000 / 3600) * PING_SECONDS;
    const start = last.current ?? { lat: 41.3266 + 0.004, lng: 69.2347 + 0.004 };
    report(start);
    const timer = setInterval(() => {
      const from = last.current ?? start;
      const to = targetRef.current;
      // Standing still is still a fix: a courier who stops reporting goes
      // stale on the server and gets no offers.
      if (!to) return report(from);
      const dLat = to.lat - from.lat;
      const dLng = to.lng - from.lng;
      const meters = Math.hypot(
        dLat * 111_000,
        dLng * 111_000 * Math.cos((from.lat * Math.PI) / 180),
      );
      if (meters < 5) return report(from);
      const share = Math.min(1, STEP_METERS / meters);
      report({
        lat: from.lat + dLat * share,
        lng: from.lng + dLng * share,
        heading: ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360,
      });
    }, PING_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [online, onFix]);
}
