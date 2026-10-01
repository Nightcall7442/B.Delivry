/**
 * The stall's orders in three piles — new, in work, done — newest on top. The stall's name and
 * whether it is open sit above them; a tap on a slip opens the order. Pull to read them again:
 * the list also refreshes itself (socket and poll, see `features/vendor`).
 */
import { scale } from '@bazar/mobile';
import {
  TONE,
  pickPile,
  shownPile,
  tr,
  vendorErrorText,
  vendorPiles,
  type PilePick,
} from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadError, NoStall, PileEmpty } from '@/components/orders/Notices';
import { OpenPill } from '@/components/orders/OpenPill';
import { OrderCard } from '@/components/orders/OrderCard';
import { PileTabs } from '@/components/orders/PileTabs';
import { OrdersSkeleton } from '@/components/orders/Skeleton';
import { Ground, sceneFont } from '@/components/scene';
import { useVendor } from '@/features/vendor';

/** The tab bar is ~64 px tall: the last slip must be able to scroll clear of it. */
const TAB_CLEARANCE = 88;

export function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, store, orders, ordersReady, ordersFailed, reloadOrders, reloadStore } =
    useVendor();
  const piles = useMemo(() => vendorPiles(orders), [orders]);
  const [pick, setPick] = useState<PilePick | null>(null);
  const shown = shownPile(pick, piles);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailure, setFailure] = useState<string | null>(null);
  // A poll that keeps failing is not «тихо у прилавка»: say the list may be stale.
  const failure =
    refreshFailure ?? (ordersFailed ? 'Нет связи — показаны последние полученные заказы.' : null);

  const refresh = () => {
    setRefreshing(true);
    setFailure(null);
    (store ? reloadOrders() : reloadStore())
      .catch((cause: unknown) => setFailure(vendorErrorText(cause)))
      .finally(() => setRefreshing(false));
  };
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
      tintColor={TONE.ochreLight}
      colors={[TONE.pomegranateDeep]}
    />
  );
  const open = (order: OrderDto) => router.push(`/order/${order.id}`);

  return (
    <Ground>
      <View style={[s.head, { paddingTop: insets.top + 12 }]}>
        <RNText style={s.title} numberOfLines={2}>
          {store ? tr(store.name, 'ru') : 'Заказы'}
        </RNText>
        {store ? <OpenPill open={store.isOpen} /> : null}
      </View>

      {!ready || (store && !ordersReady) ? (
        <OrdersSkeleton />
      ) : !store ? (
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: TAB_CLEARANCE }]}
          refreshControl={refreshControl}
        >
          {failure ? (
            <View style={s.failure}>
              <LoadError text={failure} onRetry={refresh} />
            </View>
          ) : null}
          <NoStall busy={refreshing} onRetry={refresh} />
        </ScrollView>
      ) : (
        <>
          <PileTabs piles={piles} shown={shown} onPick={(pile) => setPick(pickPile(pile, piles))} />
          <FlatList
            data={piles[shown]}
            keyExtractor={(order) => order.id}
            renderItem={({ item }) => <OrderCard order={item} onPress={() => open(item)} />}
            ItemSeparatorComponent={Gap}
            ListHeaderComponent={
              // Refreshing failed: the orders already on screen stay, and the way to try again sits above them.
              failure ? (
                <View style={s.failure}>
                  <LoadError text={failure} onRetry={refresh} />
                </View>
              ) : null
            }
            ListEmptyComponent={<PileEmpty pile={shown} />}
            contentContainerStyle={[s.content, { paddingBottom: TAB_CLEARANCE }]}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          />
        </>
      )}
    </Ground>
  );
}

const Gap = () => <View style={s.gap} />;

const s = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  title: { flex: 1, fontFamily: sceneFont.display, ...scale.headline, color: TONE.creamLight },
  content: { paddingHorizontal: 16 },
  failure: { marginBottom: 12 },
  gap: { height: 12 },
});
