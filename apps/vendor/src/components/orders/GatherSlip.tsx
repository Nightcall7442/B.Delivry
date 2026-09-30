/**
 * «Собрать»: every line of the order with its quantity, the customer's words about it, and what to
 * do if something is out. Weighed goods say so: the courier weighs them at the counter, and the
 * scale, not the quantity typed at checkout, sets the price.
 */
import { Scale, radius, scale } from '@bazar/mobile';
import {
  HALL,
  TONE,
  VENDOR_SUBSTITUTION_TEXT,
  isWeighed,
  itemCountText,
  itemQuantityText,
  tr,
} from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Paper, capital, sceneFont } from '@/components/scene';

export function GatherSlip({ order }: { order: OrderDto }) {
  return (
    <Paper>
      <View style={s.head}>
        <RNText style={s.label}>Собрать</RNText>
        <RNText style={s.count}>{itemCountText(order.items.length)}</RNText>
      </View>
      {order.items.map((item, i) => (
        <View key={item.id} style={[s.item, i > 0 && s.rule]}>
          <View style={s.line}>
            <RNText style={s.name}>{tr(item.name, 'ru')}</RNText>
            <RNText style={s.quantity}>{itemQuantityText(item)}</RNText>
          </View>
          {isWeighed(item.unit) ? (
            <View style={s.weigh}>
              <Scale size={14} color={TONE.inkSoft} />
              <RNText style={s.weighText}>Курьер взвесит на месте</RNText>
            </View>
          ) : null}
          {item.comment ? (
            <View style={s.comment}>
              <RNText style={s.commentText}>{item.comment}</RNText>
            </View>
          ) : null}
        </View>
      ))}
      <View style={s.ifOut}>
        <RNText style={s.label}>Если чего-то нет</RNText>
        <RNText style={s.ifOutText}>{VENDOR_SUBSTITUTION_TEXT[order.substitutionPolicy]}</RNText>
      </View>
    </Paper>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { ...capital, color: TONE.inkSoft },
  count: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft },
  item: { paddingVertical: 12, gap: 4 },
  // The tear line of a receipt between lines.
  rule: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: TONE.paperEdge },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  name: { flex: 1, fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  quantity: {
    fontFamily: sceneFont.heavy,
    ...scale.title,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  weigh: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weighText: { fontFamily: sceneFont.italic, ...scale.body, color: TONE.inkSoft },
  // What the customer asked of this one line: kraft, so it is read before the bag is closed.
  comment: { backgroundColor: TONE.kraft, borderRadius: radius.paper, padding: 8 },
  commentText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: HALL.ink },
  ifOut: {
    backgroundColor: TONE.kraft,
    borderRadius: radius.paper,
    padding: 12,
    gap: 2,
    marginTop: 4,
  },
  ifOutText: { fontFamily: sceneFont.ui, ...scale.lead, color: HALL.ink },
});
