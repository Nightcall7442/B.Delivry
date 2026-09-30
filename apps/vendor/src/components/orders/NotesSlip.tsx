/**
 * What the customer wrote for the stall. The note for the seller is the one that changes what goes
 * into the bag, so it gets kraft with an ochre edge and big type. The comment for the trip (the
 * intercom code, a landmark) is the courier's and stays with him: the stall never gets the door.
 */
import { scale } from '@bazar/mobile';
import { HALL, TONE } from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { StyleSheet, Text as RNText } from 'react-native';

import { Paper, capital, sceneFont } from '@/components/scene';

export function NotesSlip({ order }: { order: OrderDto }) {
  const forSeller = order.vendorComment?.trim();
  return (
    <>
      {forSeller ? (
        <Paper style={s.seller}>
          <RNText style={s.label}>Комментарий для продавца</RNText>
          <RNText style={s.sellerText}>{forSeller}</RNText>
        </Paper>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  seller: { backgroundColor: TONE.kraft, borderColor: HALL.ochre, borderWidth: 1.5 },
  label: { ...capital, color: TONE.inkSoft },
  sellerText: { fontFamily: sceneFont.uiHeavy, ...scale.lead, color: HALL.ink, marginTop: 4 },
});
