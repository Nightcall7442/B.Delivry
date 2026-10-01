/**
 * One order, as the stall needs it at the counter: where it stands, what the customer wrote, what to
 * gather, when the courier comes — and the two answers the stall may give: «Принять», or «Не смогу
 * собрать» with a reason. The customer is a first name here; the phone and the street stay with the
 * courier and the desk.
 */
import { api } from '@bazar/mobile';
import { canConfirm, canDecline, courierAtStall, vendorErrorText } from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionBar } from '@/components/orders/ActionBar';
import { BackBar } from '@/components/orders/BackBar';
import { CourierSlip } from '@/components/orders/CourierSlip';
import { DeclineSheet } from '@/components/orders/DeclineSheet';
import { FactsSlip } from '@/components/orders/FactsSlip';
import { GatherSlip } from '@/components/orders/GatherSlip';
import { LoadError } from '@/components/orders/Notices';
import { NotesSlip } from '@/components/orders/NotesSlip';
import { OrderSkeleton } from '@/components/orders/Skeleton';
import { StatusSlip } from '@/components/orders/StatusSlip';
import { useOrder } from '@/components/orders/useOrder';
import { Ground } from '@/components/scene';
import { useVendor } from '@/features/vendor';

export function OrderScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { acknowledge, reloadOrders } = useVendor();
  const { order, failure, reload, adopt } = useOrder(orderId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  // State lags a tap by a render; a second tap in that gap must not send a second request.
  const sending = useRef(false);

  // The stall has seen the order: the phone stops buzzing and the banner goes.
  useEffect(() => {
    acknowledge(orderId);
  }, [orderId, acknowledge]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /** Sends one answer; the order the API returns replaces what is on screen, the list follows. */
  const answer = async (send: () => Promise<OrderDto>): Promise<boolean> => {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      adopt(await send());
      await reloadOrders().catch(() => undefined);
      return true;
    } catch (cause) {
      setError(vendorErrorText(cause));
      // The refusal is often «it has changed meanwhile»: read what it is now — the list's copy and,
      // for an order that is not in the list (a deep link), the one fetched by hand.
      void reloadOrders().catch(() => undefined);
      void reload();
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const accept = () => void answer(() => api().orders.confirm(orderId));
  const decline = async (reason: string) => {
    if (await answer(() => api().orders.cancel(orderId, { reason }))) setDeclining(false);
  };

  const accepting = order !== null && canConfirm(order.status);
  const declinable = order !== null && canDecline(order.status);
  const atStall = order !== null && courierAtStall(order.status);

  return (
    <Ground>
      <BackBar title={order?.number ?? 'Заказ'} onBack={back} />
      {order === null ? (
        failure ? (
          <View style={s.content}>
            <LoadError text={failure} onRetry={() => void reload()} />
          </View>
        ) : (
          <OrderSkeleton />
        )
      ) : (
        <>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={[
              s.content,
              { paddingBottom: accepting || declinable ? 24 : insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <StatusSlip order={order} />
            {atStall ? <CourierSlip order={order} /> : null}
            <NotesSlip order={order} />
            <GatherSlip order={order} />
            {atStall ? null : <CourierSlip order={order} />}
            <FactsSlip order={order} />
          </ScrollView>
          {accepting || declinable ? (
            <ActionBar
              accept={accepting}
              decline={declinable}
              busy={busy}
              // While the sheet is open the refusal is shown there, where the stall is looking.
              error={declining ? null : error}
              onAccept={accept}
              onDecline={() => {
                setError(null);
                setDeclining(true);
              }}
            />
          ) : null}
          <DeclineSheet
            visible={declining && declinable}
            busy={busy}
            error={error}
            onClose={() => {
              setDeclining(false);
              setError(null);
            }}
            onSubmit={(reason) => void decline(reason)}
          />
        </>
      )}
    </Ground>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
});
