/**
 * The last slip: who ordered (the first name, nothing else — the phone and the street are the
 * courier's and the desk's business, not the stall's), how it is paid, and the stall's own money:
 * the goods, without the delivery.
 */
import { scale } from '@bazar/mobile';
import {
  HALL,
  PAYMENT_METHOD_TEXT,
  TONE,
  customerFirstName,
  goodsEstimated,
} from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Paper, sceneFont } from '@/components/scene';

export function FactsSlip({ order }: { order: OrderDto }) {
  const { subtotal } = order.totals;
  return (
    <Paper>
      <Row label="Клиент" value={customerFirstName(order.customer)} />
      <Row label="Оплата" value={PAYMENT_METHOD_TEXT[order.paymentMethod].title} />
      <View style={s.rule} />
      <View style={s.row}>
        <RNText style={s.totalLabel}>Товары</RNText>
        <RNText style={s.total}>{formatMoney(subtotal.amount, subtotal.currency)}</RNText>
      </View>
      {goodsEstimated(order) ? (
        <RNText style={s.note}>Точная сумма — после взвешивания курьером</RNText>
      ) : null}
    </Paper>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <RNText style={s.label}>{label}</RNText>
      <RNText style={s.value}>{value}</RNText>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  label: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft },
  value: { flexShrink: 1, fontFamily: sceneFont.uiHeavy, ...scale.lead, color: HALL.ink },
  // The tear line of a receipt above the sum.
  rule: {
    marginVertical: 8,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: TONE.paperEdge,
  },
  totalLabel: { fontFamily: sceneFont.uiHeavy, ...scale.lead, color: HALL.ink },
  total: {
    fontFamily: sceneFont.heavy,
    ...scale.title,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  note: { fontFamily: sceneFont.italic, ...scale.body, color: TONE.inkSoft, marginTop: 2 },
});
