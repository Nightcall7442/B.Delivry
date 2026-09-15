/**
 * «Базар сегодня» — a price ticker. A bazaar's prices move every morning, so
 * the front page runs them like a tape: what dropped, what came in fresh.
 * Content is duplicated once and slid by its own width for a seamless loop.
 */
import { arrivedToday, tr } from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ui } from '@/components/ui/Page';
import { Text, color, useLocale } from '@bazar/mobile';

const SPEED_PX_PER_S = 36;

export function Ticker({ products }: { products: readonly ProductDto[] }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const items = useMemo(
    () =>
      products
        .filter((p) => p.available && (p.oldPrice || arrivedToday(p)))
        .slice(0, 12)
        .map((p) => ({
          id: p.id,
          name: tr(p.name, locale),
          price: t.money(p.price.amount),
          delta: p.oldPrice ? -Math.round((1 - p.price.amount / p.oldPrice.amount) * 100) : null,
          fresh: arrivedToday(p),
        })),
    [products, locale, t],
  );
  const x = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!width) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: -width,
        duration: (width / SPEED_PX_PER_S) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [width, x]);
  if (items.length === 0) return null;

  const strip = (
    <View style={s.strip} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() =>
            router.push({ pathname: '/product/[productId]', params: { productId: item.id } })
          }
          style={s.item}
        >
          <Text role="caption" style={s.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text role="caption" style={s.price}>
            {item.price}
          </Text>
          {item.delta !== null ? (
            <Text role="caption" style={s.down}>
              ▼ {Math.abs(item.delta)}%
            </Text>
          ) : item.fresh ? (
            <Text role="caption" style={s.fresh}>
              ● {t('store.todayBadge')}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={s.wrap} accessibilityLabel={t('ticker.title')}>
      <View style={s.label}>
        <Text role="caption" style={s.labelText}>
          {t('ticker.title').toUpperCase()}
        </Text>
      </View>
      <View style={s.window}>
        <Animated.View style={[s.track, { transform: [{ translateX: x }] }]}>
          {strip}
          <View style={s.strip} aria-hidden>
            {items.map((item) => (
              <View key={`${item.id}-2`} style={s.item}>
                <Text role="caption" style={s.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text role="caption" style={s.price}>
                  {item.price}
                </Text>
                {item.delta !== null ? (
                  <Text role="caption" style={s.down}>
                    ▼ {Math.abs(item.delta)}%
                  </Text>
                ) : item.fresh ? (
                  <Text role="caption" style={s.fresh}>
                    ● {t('store.todayBadge')}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginTop: 12,
    height: 36,
    borderRadius: 12,
    backgroundColor: color.tile,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  label: {
    height: '100%',
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: ui.brandDeep,
    borderRadius: 12,
  },
  labelText: {
    color: color.white,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  window: { flex: 1, overflow: 'hidden', height: '100%', justifyContent: 'center' },
  track: { flexDirection: 'row' },
  strip: { flexDirection: 'row', paddingLeft: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 22 },
  name: { color: color.ink, fontSize: 12, fontWeight: '600', maxWidth: 160 },
  price: { color: color.ink, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  down: { color: color.danger, fontSize: 11, fontWeight: '700' },
  fresh: { color: ui.brandDeep, fontSize: 11, fontWeight: '700' },
});
