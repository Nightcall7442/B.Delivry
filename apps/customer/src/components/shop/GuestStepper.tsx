/**
 * «Сколько гостей?»: − 12 + on the scene's glass — one by one for a family, by fives for a toy
 * (`stepGuests`). The count is the hero of the row, in the display face.
 */
import { stepGuests, type Bundle } from '@bazar/storefront';
import { Minus, Plus, radius, scale, useLocale } from '@bazar/mobile';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { scene, sceneFont } from '@/components/bazar';

export function GuestStepper({
  bundle,
  guests,
  onChange,
  label,
}: {
  bundle: Bundle;
  guests: number;
  onChange: (guests: number) => void;
  /** What the count is of: «Гостей». */
  label: string;
}) {
  const { t } = useLocale();
  const fewer = stepGuests(bundle, guests, -1);
  const more = stepGuests(bundle, guests, 1);
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Pressable
        onPress={() => onChange(fewer)}
        disabled={fewer === guests}
        accessibilityRole="button"
        accessibilityLabel={t('bundle.fewer')}
        style={({ pressed }) => [s.round, fewer === guests && s.off, pressed && s.pressed]}
      >
        <Minus size={20} color={scene.cream} />
      </Pressable>
      <Text style={s.count} accessibilityLiveRegion="polite">
        {guests}
      </Text>
      <Pressable
        onPress={() => onChange(more)}
        disabled={more === guests}
        accessibilityRole="button"
        accessibilityLabel={t('bundle.more')}
        style={({ pressed }) => [s.round, s.accent, more === guests && s.off, pressed && s.pressed]}
      >
        <Plus size={20} color={scene.cream} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  label: { flex: 1, fontFamily: sceneFont.uiHeavy, ...scale.body, color: scene.creamMuted },
  round: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: scene.glassEdge,
    backgroundColor: scene.glass,
  },
  accent: { backgroundColor: scene.pomegranate, borderColor: scene.pomegranate },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  count: {
    minWidth: 56,
    textAlign: 'center',
    fontFamily: sceneFont.display,
    ...scale.headline,
    color: scene.cream,
    fontVariant: ['tabular-nums'],
  },
});
