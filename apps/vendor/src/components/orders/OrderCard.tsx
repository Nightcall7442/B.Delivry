/**
 * One order on the list: a slip with the number, what was asked for and the stall's money, and the
 * status said in the stall's own words. The order that waits for an answer is the chosen slip — an
 * ochre edge; the courier at the counter is lit ochre, because that is the moment to hand it over.
 */
import { Clock, press, radius, scale } from '@bazar/mobile';
import {
  HALL,
  TONE,
  alpha,
  courierAtStall,
  itemCountText,
  itemNamesText,
  placedLabel,
  scheduleHint,
  vendorPileOf,
  vendorStatusText,
  type VendorPile,
} from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import {
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Paper, sceneFont } from '@/components/scene';

export function OrderCard({ order, onPress }: { order: OrderDto; onPress: () => void }) {
  const pile = vendorPileOf(order.status);
  const atStall = courierAtStall(order.status);
  const slot = scheduleHint(order.scheduledFor);
  const { subtotal } = order.totals;
  const status = vendorStatusText(order.status);
  const money = formatMoney(subtotal.amount, subtotal.currency);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Заказ ${order.number}. ${status}. ${itemCountText(order.items.length)}, ${money}`}
      onPress={onPress}
      style={({ pressed }) => [press.base, pressed && press.down]}
    >
      <Paper style={{ ...(pile === 'fresh' ? s.chosen : null) }}>
        <View style={s.head}>
          <RNText style={s.number} numberOfLines={1}>
            {order.number}
          </RNText>
          <RNText style={s.money}>{money}</RNText>
        </View>
        <RNText style={s.meta}>
          {placedLabel(order.placedAt)} · {itemCountText(order.items.length)}
        </RNText>
        <RNText style={s.names} numberOfLines={2}>
          {itemNamesText(order.items)}
        </RNText>
        <View style={s.foot}>
          <View style={[s.chip, STAMP[pile].chip, atStall && s.chipAtStall]}>
            <RNText style={[s.chipText, STAMP[pile].text, atStall && s.chipAtStallText]}>
              {status}
            </RNText>
          </View>
          {slot ? (
            <View style={s.slot}>
              <Clock size={14} color={TONE.inkSoft} />
              <RNText style={s.slotText}>{slot}</RNText>
            </View>
          ) : null}
        </View>
      </Paper>
    </Pressable>
  );
}

const s = StyleSheet.create({
  // The chosen slip: an ochre edge. Pomegranate stays on the buttons.
  chosen: { borderColor: HALL.ochre, borderWidth: 1.5 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  number: {
    flex: 1,
    fontFamily: sceneFont.display,
    ...scale.title,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  money: {
    fontFamily: sceneFont.heavy,
    ...scale.lead,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: TONE.inkSoft,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  names: { fontFamily: sceneFont.ui, ...scale.lead, color: HALL.ink, marginTop: 8 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  chipText: { fontFamily: sceneFont.uiHeavy, ...scale.body },
  // The stamp at the counter: solid ochre.
  chipAtStall: { backgroundColor: HALL.ochre, borderColor: HALL.ochre },
  chipAtStallText: { color: HALL.ink },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotText: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft },
});

/** Waiting for the stall: ochre wash. Being carried: kraft. Over: a worn outline, muted. */
const STAMP: Record<VendorPile, { chip: ViewStyle; text: TextStyle }> = {
  fresh: { chip: { backgroundColor: alpha(HALL.ochre, 0.22) }, text: { color: HALL.pomegranate } },
  working: { chip: { backgroundColor: TONE.kraft }, text: { color: HALL.ink } },
  done: { chip: { borderColor: TONE.paperEdge }, text: { color: TONE.inkSoft } },
};
