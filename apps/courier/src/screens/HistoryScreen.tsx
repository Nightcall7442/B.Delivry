/**
 * The courier's ledger: what today and the week have paid on top, then every
 * finished trip as a paper slip, grouped by day. Only a delivered trip earns;
 * a failed or cancelled one stays on the list, muted, with its reason.
 */
import { ArrowLeft, radius, scale, shadow } from '@bazar/mobile';
import {
  GROUND,
  HALL,
  TONE,
  addressLabel,
  alpha,
  dayStart,
  finishedTrips,
  groupTripsByDay,
  hallLight,
  paidTrips,
  plural,
  sumPayout,
  tripTime,
  tripTitle,
} from '@bazar/storefront';
import { formatMoney } from '@bazar/utils/money';
import type { DeliveryDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ground, Paper, capital, sceneFont } from '@/components/scene';
import { useHistory, type HistoryData } from '@/features/history';

const ENDED: Partial<Record<DeliveryDto['status'], string>> = {
  FAILED: 'Не доставлено',
  CANCELLED: 'Отменён',
};

interface Tally {
  count: number;
  total: number;
}

const deliveries = (count: number) =>
  `${count} ${plural(count, 'доставка', 'доставки', 'доставок')}`;

/** The list and the two sums the API has no endpoint for, counted from the trips just loaded. */
function summarize({ trips, at }: HistoryData) {
  const finished = finishedTrips(trips);
  const week = dayStart(at, 6);
  const tally = (since?: number): Tally => ({
    count: paidTrips(finished, since).length,
    total: sumPayout(finished, since),
  });
  const sections = groupTripsByDay(finished, at).map(({ key, label, total, trips: data }) => ({
    key,
    label,
    total,
    data,
  }));
  return { sections, week: tally(week), all: tally() };
}

export function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, failed, reload } = useHistory();
  const [refreshing, setRefreshing] = useState(false);
  const view = useMemo(() => (data ? summarize(data) : null), [data]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/shift'));
  const refresh = () => {
    setRefreshing(true);
    void reload().then(() => setRefreshing(false));
  };

  return (
    <Ground>
      <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={back}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Назад к смене"
          style={({ pressed }) => [s.back, pressed && { opacity: 0.85 }]}
        >
          <ArrowLeft size={18} color={TONE.creamLight} />
          <RNText style={s.backText}>Смена</RNText>
        </Pressable>
        <RNText style={s.title}>История</RNText>
      </View>

      <SectionList
        sections={view?.sections ?? []}
        keyExtractor={(trip) => trip.id}
        renderItem={({ item }) => <TripSlip trip={item} />}
        renderSectionHeader={({ section }) => (
          <View style={s.dayHead}>
            <RNText style={s.day}>{section.label}</RNText>
            {section.total > 0 ? (
              <RNText style={s.dayTotal}>
                {formatMoney(section.total, section.data[0]?.payout.currency)}
              </RNText>
            ) : null}
          </View>
        )}
        ItemSeparatorComponent={Gap}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          data && view ? (
            <>
              {/* Refreshing failed: the last numbers stay, and the way to try again sits above them. */}
              {failed ? <LoadError onRetry={() => void reload()} /> : null}
              <RNText style={s.profile}>
                {[
                  data.courier.firstName,
                  // A rating means something after the first delivery, not before.
                  data.courier.completedOrders > 0 ? `★ ${data.courier.rating.toFixed(1)}` : null,
                  deliveries(data.courier.completedOrders),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </RNText>
              <Earnings data={data} week={view.week} all={view.all} />
            </>
          ) : null
        }
        ListEmptyComponent={
          data ? <Empty /> : failed ? <LoadError onRetry={() => void reload()} /> : <Skeleton />
        }
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={TONE.ochreLight}
            colors={[TONE.pomegranateDeep]}
          />
        }
      />
    </Ground>
  );
}

/** Today from the API, the week and the total from the courier's own delivered trips. */
function Earnings({ data, week, all }: { data: HistoryData; week: Tally; all: Tally }) {
  const { shift, trips, truncated } = data;
  const { currency } = shift.todayEarnings;
  return (
    <Paper style={s.earn}>
      <RNText style={s.label}>Сегодня</RNText>
      <RNText style={s.money}>{formatMoney(shift.todayEarnings.amount, currency)}</RNText>
      <RNText style={s.muted}>{deliveries(shift.todayOrders)}</RNText>
      <View style={s.rule} />
      <View style={s.lines}>
        <SumLine label="7 дней" tally={week} currency={currency} />
        {/* Past the cap the sum covers only what was loaded, and the label says so. */}
        <SumLine
          label={
            truncated
              ? `Последние ${trips.length} ${plural(trips.length, 'поездка', 'поездки', 'поездок')}`
              : 'Всего'
          }
          tally={all}
          currency={currency}
        />
      </View>
    </Paper>
  );
}

function SumLine({
  label,
  tally,
  currency,
}: {
  label: string;
  tally: Tally;
  currency: DeliveryDto['payout']['currency'];
}) {
  return (
    <View style={s.line}>
      <View style={{ flex: 1 }}>
        <RNText style={s.lineLabel}>{label}</RNText>
        <RNText style={s.muted}>{deliveries(tally.count)}</RNText>
      </View>
      <RNText style={s.lineMoney}>{formatMoney(tally.total, currency)}</RNText>
    </View>
  );
}

function TripSlip({ trip }: { trip: DeliveryDto }) {
  const { title, number } = tripTitle(trip);
  const paid = trip.status === 'DELIVERED';
  const km = `${(trip.distanceMeters / 1000).toFixed(1)} км`;
  return (
    <Paper style={s.trip}>
      <RNText style={s.time} numberOfLines={1}>
        {tripTime(trip)}
      </RNText>
      <View style={s.tripBody}>
        <View style={s.tripHead}>
          <RNText style={[s.stall, !paid && { color: TONE.inkSoft }]} numberOfLines={1}>
            {title}
          </RNText>
          {paid ? (
            <RNText style={s.payout}>
              {formatMoney(trip.payout.amount, trip.payout.currency)}
            </RNText>
          ) : null}
        </View>
        <RNText style={s.muted} numberOfLines={1}>
          {number ? `${number} · ${km}` : km}
        </RNText>
        <RNText style={s.address} numberOfLines={2}>
          → {addressLabel(trip.dropoffAddress)}
        </RNText>
        {paid ? null : (
          <View style={s.ended}>
            <View style={s.chip}>
              <RNText style={s.chipText}>{ENDED[trip.status] ?? 'Не завершено'}</RNText>
            </View>
            {trip.failureReason ? <RNText style={s.hint}>{trip.failureReason}</RNText> : null}
          </View>
        )}
      </View>
    </Paper>
  );
}

const Gap = () => <View style={s.gap} />;

/** Nothing finished yet: said the way the shift screen says «Ждём заказы». */
function Empty() {
  return (
    <Paper style={s.empty}>
      <RNText style={s.slipTitle}>Пока ни одной доставки</RNText>
      <RNText style={s.aside}>
        Довезёте первый заказ — и он ляжет сюда, как чек в кассе: со временем, адресом и заработком.
      </RNText>
    </Paper>
  );
}

/** «Could not load · Retry»: a paper slip on the ground, the line said aloud, one way to try again. */
function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={s.error}>
      <RNText style={s.errorText}>Не удалось загрузить историю</RNText>
      <Pressable
        onPress={onRetry}
        hitSlop={4}
        accessibilityRole="button"
        style={({ pressed }) => [s.retry, pressed && { opacity: 0.85 }]}
      >
        <RNText style={s.retryText}>Повторить →</RNText>
      </Pressable>
    </View>
  );
}

/** The card, one day heading and three slips, in kraft: the shape of the screen before it has any numbers. */
function Skeleton() {
  return (
    <View accessible accessibilityLabel="Загрузка">
      <Bone style={{ height: 20, width: 200, marginBottom: 12 }} />
      <Bone style={{ height: 184 }} />
      <Bone style={{ height: 14, width: 96, marginTop: 24, marginBottom: 8 }} />
      <View style={s.boneRows}>
        {[0, 1, 2].map((i) => (
          <Bone key={i} style={{ height: 96 }} />
        ))}
      </View>
    </View>
  );
}

/** A soft pulse on kraft; it holds still under «Уменьшить движение». */
function Bone({ style }: { style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  const still = useStillness();
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);
  return <Animated.View style={[s.bone, { opacity: pulse }, style]} />;
}

function useStillness(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setStill(value));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return still;
}

// Slips lie on the hall, so they lift with the one shadow; the text on them is HALL/TONE ink.
const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  // Glass over the ground: the hall's own base at half strength with the cream edge.
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: radius.pill,
    backgroundColor: alpha(GROUND[hallLight()].base, 0.55),
    borderWidth: 1,
    borderColor: alpha(TONE.creamLight, 0.22),
  },
  backText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: TONE.creamLight },
  title: { fontFamily: sceneFont.display, ...scale.headline, color: TONE.creamLight },
  content: { paddingHorizontal: 16 },
  profile: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: TONE.creamMuted,
    fontVariant: ['tabular-nums'],
    marginBottom: 12,
  },
  earn: { gap: 2 },
  label: { ...capital, color: TONE.inkSoft },
  money: {
    fontFamily: sceneFont.heavy,
    ...scale.headline,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  muted: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: TONE.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  // The tear line of a receipt between today and the running sums.
  rule: {
    marginVertical: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: TONE.paperEdge,
  },
  lines: { gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineLabel: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: HALL.ink },
  lineMoney: {
    fontFamily: sceneFont.heavy,
    ...scale.lead,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 24,
    paddingBottom: 8,
  },
  day: { ...capital, color: TONE.ochreLight },
  dayTotal: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.body,
    color: TONE.creamLight,
    fontVariant: ['tabular-nums'],
  },
  gap: { height: 8 },
  boneRows: { gap: 8 },
  trip: { flexDirection: 'row', gap: 12 },
  time: {
    minWidth: 44,
    flexShrink: 0,
    paddingTop: 2,
    fontFamily: sceneFont.heavy,
    ...scale.body,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  tripBody: { flex: 1, minWidth: 0, gap: 2 },
  tripHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  stall: { flex: 1, fontFamily: sceneFont.display, ...scale.lead, color: HALL.ink },
  payout: {
    fontFamily: sceneFont.heavy,
    ...scale.lead,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  address: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.ink },
  ended: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  // A muted stamp: kraft with a paper edge, no pomegranate — that colour is only the button's.
  chip: {
    backgroundColor: TONE.kraft,
    borderWidth: 1,
    borderColor: TONE.paperEdge,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  chipText: { fontFamily: sceneFont.uiHeavy, ...scale.caption, color: TONE.inkSoft },
  hint: { flexShrink: 1, fontFamily: sceneFont.italic, ...scale.body, color: TONE.inkSoft },
  empty: { gap: 4, marginTop: 12 },
  slipTitle: { fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  // An aside from the bazaar, said aloud: Alegreya italic.
  aside: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  error: {
    marginBottom: 12,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: HALL.cream,
    borderWidth: 1,
    borderColor: TONE.paperEdge,
    borderRadius: radius.paper,
    transform: [{ rotate: '-0.6deg' }],
    ...shadow.paper,
  },
  errorText: { flex: 1, fontFamily: sceneFont.italic, ...scale.lead, color: HALL.ink },
  retry: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: HALL.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontFamily: sceneFont.display, ...scale.body, color: TONE.creamLight },
  bone: { backgroundColor: TONE.kraft, borderRadius: radius.paper },
});
