/** «Открыт» / «Закрыт»: whether customers can order from the stall right now, as a glass pill. */
import { radius, scale } from '@bazar/mobile';
import { GROUND, TONE, alpha, hallLight } from '@bazar/storefront';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { sceneFont } from '@/components/scene';

export function OpenPill({ open }: { open: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={open ? 'Прилавок открыт' : 'Прилавок закрыт'}
      style={s.pill}
    >
      <View style={[s.dot, { backgroundColor: open ? TONE.turquoise : TONE.pomegranateLit }]} />
      <RNText style={s.text}>{open ? 'Открыт' : 'Закрыт'}</RNText>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: alpha(GROUND[hallLight()].base, 0.55),
    borderWidth: 1,
    borderColor: alpha(TONE.creamLight, 0.22),
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: TONE.creamLight },
});
