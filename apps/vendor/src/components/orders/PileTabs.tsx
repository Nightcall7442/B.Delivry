/**
 * Three piles of orders as three stamps: the count big, the name under it. A busy stall reads the
 * number from across the counter; an unanswered pile is lit in ochre until somebody opens it.
 */
import { press, radius, scale } from '@bazar/mobile';
import {
  GROUND,
  HALL,
  TONE,
  VENDOR_PILES,
  VENDOR_PILE_LABEL,
  alpha,
  hallLight,
  type VendorPile,
} from '@bazar/storefront';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { sceneFont } from '@/components/scene';

export function PileTabs({
  piles,
  shown,
  onPick,
}: {
  piles: Record<VendorPile, readonly unknown[]>;
  shown: VendorPile;
  onPick: (pile: VendorPile) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={s.row}>
      {VENDOR_PILES.map((pile) => {
        const active = pile === shown;
        const count = piles[pile].length;
        // New orders wait for an answer: the pile keeps asking while another one is open.
        const asking = pile === 'fresh' && count > 0 && !active;
        return (
          <Pressable
            key={pile}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${VENDOR_PILE_LABEL[pile]}: ${count}`}
            onPress={() => onPick(pile)}
            style={({ pressed }) => [
              s.tab,
              active && s.tabActive,
              asking && s.tabAsking,
              press.base,
              pressed && press.down,
            ]}
          >
            <RNText style={[s.count, active ? s.inkOn : s.inkOff, asking && s.countAsking]}>
              {count}
            </RNText>
            <RNText style={[s.label, active ? s.inkOn : s.inkOff]} numberOfLines={1}>
              {VENDOR_PILE_LABEL[pile]}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  // Glass over the ground: the hall's own base at half strength with the cream edge.
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.paper,
    backgroundColor: alpha(GROUND[hallLight()].base, 0.55),
    borderWidth: 1,
    borderColor: alpha(TONE.creamLight, 0.22),
  },
  // The chosen pile is a slip of paper.
  tabActive: { backgroundColor: HALL.cream, borderColor: TONE.paperEdge },
  tabAsking: { borderColor: HALL.ochre, borderWidth: 1.5 },
  count: { fontFamily: sceneFont.heavy, ...scale.title, fontVariant: ['tabular-nums'] },
  label: { fontFamily: sceneFont.uiHeavy, ...scale.caption },
  inkOn: { color: HALL.ink },
  inkOff: { color: TONE.creamLight },
  countAsking: { color: TONE.ochreLight },
});
