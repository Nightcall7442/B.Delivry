/**
 * "Ещё 45 000 сум — и доставка бесплатно": the cheapest AOV lever there is.
 */
import { Text, color, useT } from '@bazar/mobile';
import { freeDeliveryProgress } from '@bazar/storefront';
import type { MoneyDto } from '@bazar/types';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export function FreeDeliveryBar({
  subtotal,
  threshold,
  style,
}: {
  subtotal: number;
  threshold?: MoneyDto | null;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = freeDeliveryProgress(subtotal, threshold);
  const t = useT();
  if (!progress) return null;
  return (
    <View style={[s.root, style]}>
      {progress.reached ? (
        <Text role="caption" style={{ color: color.brand600, fontWeight: '500' }}>
          {t('cart.freeReached')}
        </Text>
      ) : (
        <Text role="caption">{t('cart.freeMore', { amount: t.money(progress.remaining) })}</Text>
      )}
      <View style={s.track}>
        <View
          style={[
            s.fill,
            { width: `${Math.max(4, progress.ratio * 100)}%` },
            progress.reached ? { backgroundColor: color.brand500 } : null,
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: color.raise,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: color.sand200, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.saffron400 },
});
