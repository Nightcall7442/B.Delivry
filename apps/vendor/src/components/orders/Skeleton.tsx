/**
 * The shape of a screen before it has any orders: kraft bones that pulse softly, and hold still
 * under «Уменьшить движение». A line appears if the wait drags on — a bazaar has bad signal.
 */
import { radius, scale } from '@bazar/mobile';
import { TONE } from '@bazar/storefront';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { sceneFont } from '@/components/scene';

/** A soft pulse on kraft. */
export function Bone({ style }: { style?: StyleProp<ViewStyle> }) {
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

function useSlow(afterMs: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(timer);
  }, [afterMs]);
  return slow;
}

const SLOW_MS = 10_000;

function Slow() {
  return useSlow(SLOW_MS) ? (
    <RNText style={s.slow}>Долго грузится — проверьте интернет. Мы продолжаем пробовать.</RNText>
  ) : null;
}

/** Three slips of the list. */
export function OrdersSkeleton() {
  return (
    <View accessible accessibilityLabel="Загрузка заказов" style={s.list}>
      {[0, 1, 2].map((i) => (
        <Bone key={i} style={{ height: 132 }} />
      ))}
      <Slow />
    </View>
  );
}

/** The status slip, the notes and the list to gather. */
export function OrderSkeleton() {
  return (
    <View accessible accessibilityLabel="Загрузка заказа" style={s.list}>
      <Bone style={{ height: 120 }} />
      <Bone style={{ height: 88 }} />
      <Bone style={{ height: 240 }} />
      <Slow />
    </View>
  );
}

const s = StyleSheet.create({
  list: { paddingHorizontal: 16, gap: 12 },
  bone: { backgroundColor: TONE.kraft, borderRadius: radius.paper },
  slow: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.creamMuted, marginTop: 4 },
});
