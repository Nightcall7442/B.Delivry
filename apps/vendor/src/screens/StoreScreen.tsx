/**
 * The stall itself, top to bottom: how it looks to a customer right now, its counter photograph,
 * its hours, what it has sold, the customers haggling over a price, and the seller's own number.
 * Edits go to the API and the stall is read again, so the header is always what customers see.
 */
import { scale } from '@bazar/mobile';
import { TONE } from '@bazar/storefront';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Bone, NoStall } from '@/components/goods/feedback';
import { Ground, capital, sceneFont } from '@/components/scene';
import { SignOut, TelegramCard } from '@/components/stall/AccountCard';
import { CounterPhoto } from '@/components/stall/CounterPhoto';
import { HaggleCard } from '@/components/stall/HaggleCard';
import { LookCard } from '@/components/stall/LookCard';
import { HoursCard } from '@/components/stall/HoursCard';
import { RevenueCard } from '@/components/stall/RevenueCard';
import { StallHeader } from '@/components/stall/StallHeader';
import { useHaggles } from '@/components/stall/use-haggles';
import { useLooks } from '@/components/stall/use-looks';
import { useRevenue } from '@/components/stall/use-revenue';
import { useVendor } from '@/features/vendor';

/** The tab bar the page must clear. */
const TAB_BAR = 64;

export function StoreScreen() {
  const insets = useSafeAreaInsets();
  const { ready, stores, store, selectStore, reloadStore } = useVendor();
  const storeId = store?.id ?? null;
  const revenue = useRevenue(storeId);
  const haggles = useHaggles(storeId);
  const looks = useLooks(storeId);
  const [refreshing, setRefreshing] = useState(false);

  // Reading the stall again after a write that went through must not turn the write into a failure.
  const reread = () => reloadStore().catch(() => undefined);

  const refresh = () => {
    setRefreshing(true);
    void Promise.all([reread(), revenue.reload(), haggles.reload(), looks.reload()]).then(() =>
      setRefreshing(false),
    );
  };

  return (
    <Ground>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.fill}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={TONE.ochreLight}
              colors={[TONE.pomegranateDeep]}
            />
          }
        >
          <RNText style={s.title} accessibilityRole="header">
            Прилавок
          </RNText>

          {!ready ? (
            <View accessible accessibilityLabel="Загрузка" style={s.section}>
              <Bone style={{ height: 300 }} />
              <Bone style={{ height: 120 }} />
            </View>
          ) : !store ? (
            <NoStall />
          ) : (
            // A stall of its own, a form of its own: the key drops what was typed about the last one.
            <View key={store.id} style={s.section}>
              <StallHeader stores={stores} store={store} onSelect={selectStore} />
              <CounterPhoto store={store} onChanged={reread} />
              {/* Time-sensitive like an order: a customer is deciding right now. */}
              <LookCard looks={looks} />

              <RNText style={s.heading}>Часы</RNText>
              <HoursCard store={store} onSaved={reread} />

              <RNText style={s.heading}>Выручка</RNText>
              <RevenueCard
                revenue={revenue.revenue}
                failed={revenue.failed}
                onRetry={() => void revenue.reload()}
              />

              <RNText style={s.heading}>Торг</RNText>
              <HaggleCard haggles={haggles} />

              <RNText style={s.heading}>Уведомления</RNText>
              <TelegramCard />
            </View>
          )}

          <SignOut />
        </ScrollView>
      </KeyboardAvoidingView>
    </Ground>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  title: { fontFamily: sceneFont.display, ...scale.headline, color: TONE.creamLight },
  section: { gap: 12 },
  heading: { ...capital, color: TONE.ochreLight, marginTop: 12 },
});
