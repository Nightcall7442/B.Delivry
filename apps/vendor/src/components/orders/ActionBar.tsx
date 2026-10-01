/**
 * The bar under the order: «Принять» while the order waits for an answer, «Не смогу собрать» while
 * the goods are still the stall's. Paper lifted over the list, big buttons — it is used with one
 * hand, between customers.
 */
import { Button, radius, scale, shadow } from '@bazar/mobile';
import { HALL, TONE, alpha } from '@bazar/storefront';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sceneFont } from '@/components/scene';

export function ActionBar({
  accept,
  decline,
  busy,
  error,
  onAccept,
  onDecline,
}: {
  accept: boolean;
  decline: boolean;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
      {error ? (
        <RNText accessibilityRole="alert" style={s.error}>
          {error}
        </RNText>
      ) : null}
      {accept ? (
        <Button
          label={busy ? 'Секунду…' : 'Принять'}
          accessibilityRole="button"
          accessibilityLabel="Принять заказ"
          disabled={busy}
          onPress={onAccept}
        />
      ) : null}
      {decline ? (
        <Button
          label="Не смогу собрать"
          variant="secondary"
          accessibilityRole="button"
          disabled={busy}
          onPress={onDecline}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: HALL.cream,
    borderTopLeftRadius: radius.paper,
    borderTopRightRadius: radius.paper,
    borderTopWidth: 1,
    borderColor: alpha(TONE.paperEdge, 0.4),
    ...shadow.paper,
  },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
});
