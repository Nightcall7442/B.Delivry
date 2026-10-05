/** The top of the order screen: the way back to the list, and the order's number as its title. */
import { ArrowLeft, radius, scale } from '@bazar/mobile';
import { GROUND, TONE, alpha, hallLight } from '@bazar/storefront';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sceneFont } from '@/components/scene';

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Назад к заказам"
        style={({ pressed }) => [s.back, pressed && { opacity: 0.85 }]}
      >
        <ArrowLeft size={18} color={TONE.creamLight} />
        <RNText style={s.backText}>Заказы</RNText>
      </Pressable>
      <RNText style={s.title} numberOfLines={1}>
        {title}
      </RNText>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  // Glass over the ground: the hall's own base at half strength with the cream edge.
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 48,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: radius.pill,
    backgroundColor: alpha(GROUND[hallLight()].base, 0.55),
    borderWidth: 1,
    borderColor: alpha(TONE.creamLight, 0.22),
  },
  backText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: TONE.creamLight },
  title: {
    flex: 1,
    fontFamily: sceneFont.display,
    ...scale.title,
    color: TONE.creamLight,
    // Lining figures: an order number is compared by eye and read aloud.
    fontVariant: ['lining-nums', 'tabular-nums'],
  },
});
