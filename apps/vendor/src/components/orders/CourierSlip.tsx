/**
 * The courier as the stall needs to know them: where they are in the job and when they are due. At
 * the counter the slip turns solid ochre and says what to do — the one moment the stall must not miss.
 */
import { scale } from '@bazar/mobile';
import {
  HALL,
  TONE,
  courierAtStall,
  courierEtaText,
  courierInPlay,
  vendorStatusHint,
  vendorStatusText,
} from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { StyleSheet, Text as RNText } from 'react-native';

import { Paper, capital, sceneFont } from '@/components/scene';

export function CourierSlip({ order }: { order: OrderDto }) {
  if (!courierInPlay(order.status)) return null;
  const atStall = courierAtStall(order.status);
  const hint = vendorStatusHint(order.status);
  const eta = courierEtaText(order);
  return (
    <Paper style={{ ...(atStall ? s.atStall : null) }}>
      <RNText style={[s.label, atStall && s.labelAtStall]}>Курьер</RNText>
      <RNText style={s.status}>{vendorStatusText(order.status)}</RNText>
      {hint ? <RNText style={atStall ? s.hintAtStall : s.hint}>{hint}</RNText> : null}
      {eta ? <RNText style={s.eta}>{eta}</RNText> : null}
    </Paper>
  );
}

const s = StyleSheet.create({
  atStall: { backgroundColor: HALL.ochre, borderColor: TONE.ochreDeep, borderWidth: 1.5 },
  label: { ...capital, color: TONE.inkSoft },
  labelAtStall: { color: HALL.ink },
  status: { fontFamily: sceneFont.display, ...scale.headline, color: HALL.ink, marginTop: 4 },
  hint: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft, marginTop: 2 },
  hintAtStall: { fontFamily: sceneFont.uiHeavy, ...scale.lead, color: HALL.ink, marginTop: 2 },
  eta: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
});
