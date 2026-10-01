/**
 * The small states every list of the stall shares: a kraft block that pulses while the numbers are
 * on their way, a slip that says there is nothing here yet, and a slip that says it did not work
 * and offers the one way to try again.
 */
import { radius, scale, shadow } from '@bazar/mobile';
import { HALL, TONE } from '@bazar/storefront';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Paper, sceneFont } from '@/components/scene';

/** A soft pulse on kraft; it holds still under «Уменьшить движение». */
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

/** Nothing here yet: a title and, under it, the line said aloud — what this place is for. */
export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <Paper style={s.empty}>
      <RNText style={s.slipTitle}>{title}</RNText>
      {text ? <RNText style={s.aside}>{text}</RNText> : null}
    </Paper>
  );
}

/** The signed-in number has no stall: nothing on the goods or the stall tab can work without one. */
export const NoStall = () => (
  <Empty
    title="Прилавок не найден"
    text="К этому номеру не привязан ни один прилавок. Обратитесь в поддержку Bazar — там подключат его к вашему номеру."
  />
);

/** «Could not load · Retry»: a paper slip on the ground, the line said aloud, one way to try again. */
export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={s.error} accessibilityRole="alert">
      <RNText style={s.errorText}>{text}</RNText>
      <Pressable
        onPress={onRetry}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Повторить"
        style={({ pressed }) => [s.retry, pressed && { opacity: 0.85 }]}
      >
        <RNText style={s.retryText}>Повторить →</RNText>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { gap: 4 },
  slipTitle: { fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  // An aside from the bazaar, said aloud: Alegreya italic.
  aside: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  bone: { backgroundColor: TONE.kraft, borderRadius: radius.paper },
  error: {
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
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: HALL.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontFamily: sceneFont.display, ...scale.body, color: TONE.creamLight },
});
