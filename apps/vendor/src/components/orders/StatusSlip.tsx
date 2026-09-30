/**
 * The top slip of an order: where it stands in the stall's words, what to do about it, when it came
 * and — for a slot order — the window it is wanted in. The one that waits for an answer is the chosen
 * slip, with the ochre edge.
 */
import { Clock, radius, scale } from '@bazar/mobile';
import {
  HALL,
  TONE,
  alpha,
  placedLabel,
  scheduleHint,
  vendorStatusHint,
  vendorStatusText,
  canConfirm,
} from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Paper, capital, sceneFont } from '@/components/scene';

export function StatusSlip({ order }: { order: OrderDto }) {
  const hint = vendorStatusHint(order.status);
  const slot = scheduleHint(order.scheduledFor);
  return (
    <Paper style={{ ...(canConfirm(order.status) ? s.chosen : null) }}>
      <RNText style={s.label}>Заказ поступил {placedLabel(order.placedAt)}</RNText>
      <RNText style={s.status}>{vendorStatusText(order.status)}</RNText>
      {hint ? <RNText style={s.hint}>{hint}</RNText> : null}
      {order.cancelReason ? <RNText style={s.hint}>Причина: {order.cancelReason}</RNText> : null}
      {slot ? (
        <View style={s.slot}>
          <Clock size={16} color={HALL.ink} />
          <RNText style={s.slotText}>{slot}</RNText>
        </View>
      ) : null}
    </Paper>
  );
}

const s = StyleSheet.create({
  chosen: { borderColor: HALL.ochre, borderWidth: 1.5 },
  label: { ...capital, color: TONE.inkSoft, fontVariant: ['tabular-nums'] },
  status: { fontFamily: sceneFont.display, ...scale.headline, color: HALL.ink, marginTop: 4 },
  hint: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft, marginTop: 2 },
  // A slot order is wanted at a set hour: an ochre wash, so it is not read as «as soon as possible».
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: alpha(HALL.ochre, 0.22),
  },
  slotText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: HALL.ink },
});
