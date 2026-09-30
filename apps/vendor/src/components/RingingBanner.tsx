/**
 * «Новый заказ»: over every screen until somebody has looked at it, while the phone buzzes. A stall
 * at a bazaar is loud and its owner busy — the banner is big, and one tap opens the order.
 */
import { formatMoney } from '@bazar/utils/money';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { press, radius, scale, shadow } from '@bazar/mobile';
import { HALL, TONE, alpha, tr } from '@bazar/storefront';

import { capital, sceneFont } from '@/components/scene';
import { useVendor } from '@/features/vendor';

export function RingingBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ringing, acknowledge, stores } = useVendor();
  if (!ringing) return null;

  const items = ringing.items.length;
  const open = () => {
    acknowledge(ringing.id);
    router.push(`/order/${ringing.id}`);
  };

  return (
    <View pointerEvents="box-none" style={[s.wrap, { top: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Новый заказ ${ringing.number}`}
        onPress={open}
        style={({ pressed }) => [s.banner, shadow.paper, press.base, pressed && press.down]}
      >
        <View style={{ flex: 1 }}>
          <RNText style={s.tag}>Новый заказ</RNText>
          <RNText style={s.number}>{ringing.number}</RNText>
          {stores.length > 1 ? (
            <RNText style={s.line}>{tr(ringing.store.name, 'ru')}</RNText>
          ) : null}
          <RNText style={s.line}>
            {items} поз. ·{' '}
            {formatMoney(ringing.totals.subtotal.amount, ringing.totals.subtotal.currency)}
          </RNText>
        </View>
        <View style={s.actions}>
          <RNText style={s.open}>Открыть →</RNText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Заглушить"
            hitSlop={10}
            onPress={() => acknowledge(ringing.id)}
          >
            <RNText style={s.mute}>Заглушить</RNText>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: HALL.pomegranate,
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: alpha(TONE.paperEdge, 0.4),
    padding: 16,
  },
  tag: { ...capital, color: TONE.ochreLight },
  number: { fontFamily: sceneFont.display, ...scale.title, color: HALL.cream },
  line: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.creamLight, marginTop: 2 },
  actions: { alignItems: 'flex-end', gap: 10 },
  open: { fontFamily: sceneFont.heavy, ...scale.body, color: HALL.cream },
  mute: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.creamMuted },
});
