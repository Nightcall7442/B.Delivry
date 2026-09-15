/**
 * Product tile of the redesign: a white card, the picture on a soft tile,
 * name and unit, the price on the left and a round green "+" on the right
 * that becomes a stepper once the product is in the cart. Tap the picture
 * for the product screen.
 */
import { arrivedToday, cashbackFor, tagLabel, tr, unitLabel } from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ui } from '@/components/ui/Page';
import { useCartItem } from '@/features/cart/store';
import { Coin, Leaf, Minus, Photo, Plus, Star, Text, color, press, useLocale } from '@bazar/mobile';

export function ProductTile({
  product,
  style,
  compact = false,
}: {
  product: ProductDto;
  style?: StyleProp<ViewStyle>;
  /** Rail size (fixed width) instead of grid cell. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const step = product.quantityStep || 1;
  const { quantity, add, remove } = useCartItem(product.id, step, product.minQuantity || step);
  const unit = unitLabel(locale)[product.unit];
  const soldOut = !product.available;
  const discount = product.oldPrice
    ? Math.round((1 - product.price.amount / product.oldPrice.amount) * 100)
    : 0;
  const open = () =>
    router.push({ pathname: '/product/[productId]', params: { productId: product.id } });

  return (
    <View style={[s.tile, compact && s.compact, soldOut && { opacity: 0.55 }, style]}>
      <Pressable
        onPress={open}
        style={({ pressed }) => [s.picture, press.base, pressed && press.down]}
      >
        <Photo
          uri={product.images[0]?.url}
          style={s.photo}
          sharedTag={`product-${product.id}`}
          fallback={<Leaf size={40} color={color.sand300} />}
        />
        {discount ? (
          <View style={[s.badge, { backgroundColor: color.danger }]}>
            <Text role="caption" style={s.badgeText}>
              −{discount}%
            </Text>
          </View>
        ) : arrivedToday(product) ? (
          <View style={[s.badge, { backgroundColor: ui.brand }]}>
            <Text role="caption" style={s.badgeText}>
              {t('store.todayBadge')}
            </Text>
          </View>
        ) : product.tags[0] ? (
          <View style={[s.badge, { backgroundColor: color.saffron500 }]}>
            <Text role="caption" style={s.badgeText}>
              {tagLabel(locale)[product.tags[0]]}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Pressable onPress={open}>
        <Text role="body" numberOfLines={compact ? 1 : 2} style={s.name}>
          {tr(product.name, locale)}
        </Text>
        {product.reviewCount > 0 ? (
          <View style={s.rating}>
            <Star size={11} color={color.saffron500} fill={color.saffron500} strokeWidth={2} />
            <Text role="caption" style={s.ratingText}>
              {product.rating.toFixed(1)}
            </Text>
            <Text role="caption" style={{ fontSize: 11 }}>
              · {t('tile.reviews', { count: product.reviewCount })}
            </Text>
          </View>
        ) : null}
        <View style={s.priceRow}>
          <Text role="price" style={s.price}>
            {t.money(product.price.amount)}
          </Text>
          {product.oldPrice ? (
            <Text role="caption" style={s.oldPrice}>
              {t.money(product.oldPrice.amount)}
            </Text>
          ) : null}
        </View>
        {!compact && cashbackFor(product.price.amount) > 0 ? (
          <View style={s.cashback}>
            <Text role="caption" style={s.cashbackText} numberOfLines={1}>
              +{t.qty(cashbackFor(product.price.amount) / 100)}
            </Text>
            <Coin size={12} color={ui.brandDeep} strokeWidth={2.4} />
          </View>
        ) : null}
      </Pressable>

      {!compact && !soldOut ? (
        quantity === 0 ? (
          <Pressable
            onPress={add}
            style={({ pressed }) => [s.buy, press.base, pressed && press.down]}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.addOne', { name: tr(product.name, locale) })}
          >
            <Text role="caption" style={s.buyText}>
              {t('product.addToCart')}
            </Text>
            <Text role="caption" style={[s.buyText, { opacity: 0.7 }]}>
              · 1 {unit}
            </Text>
          </Pressable>
        ) : (
          <View style={[s.stepper, s.stepperWide]}>
            <Pressable
              onPress={remove}
              style={s.step}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.removeOne', { name: tr(product.name, locale) })}
            >
              <Minus size={16} color={ui.brandDeep} strokeWidth={2.6} />
            </Pressable>
            <Text role="caption" style={[s.stepValue, { flex: 1, fontSize: 14 }]}>
              {t.qty(quantity)} {unit}
            </Text>
            <Pressable
              onPress={add}
              style={s.step}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.addOne', { name: tr(product.name, locale) })}
            >
              <Plus size={16} color={ui.brandDeep} strokeWidth={2.6} />
            </Pressable>
          </View>
        )
      ) : null}

      <View style={[s.bottom, !compact && { display: 'none' }]}>
        <Text role="caption" numberOfLines={1} style={{ flex: 1 }}>
          {product.stock !== null && product.stock <= 10
            ? t('store.left', { count: product.stock ?? 0 })
            : `1 ${unit}`}
        </Text>
        {soldOut ? null : quantity === 0 ? (
          <Pressable
            onPress={add}
            style={({ pressed }) => [s.plus, press.base, pressed && press.down]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.addOne', { name: tr(product.name, locale) })}
          >
            <Plus size={18} color={color.white} strokeWidth={2.6} />
          </Pressable>
        ) : (
          <View style={s.stepper}>
            <Pressable
              onPress={remove}
              style={s.step}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.removeOne', { name: tr(product.name, locale) })}
            >
              <Minus size={14} color={ui.brandDeep} strokeWidth={2.6} />
            </Pressable>
            <Text role="caption" style={s.stepValue}>
              {t.qty(quantity)}
            </Text>
            <Pressable
              onPress={add}
              style={s.step}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.addOne', { name: tr(product.name, locale) })}
            >
              <Plus size={14} color={ui.brandDeep} strokeWidth={2.6} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: color.tile,
    borderRadius: 20,
    padding: 8,
  },
  compact: { flexGrow: 0, flexShrink: 0, flexBasis: 156, width: 156 },
  picture: {
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: color.field,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { ...StyleSheet.absoluteFillObject },
  badge: {
    position: 'absolute',
    left: 8,
    top: 8,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: { color: color.white, fontSize: 11, lineHeight: 13, fontWeight: '700' },
  name: { marginTop: 10, fontSize: 14, lineHeight: 18, fontWeight: '500' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ratingText: { color: color.ink, fontSize: 11, fontWeight: '600' },
  cashback: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cashbackText: { color: ui.brandDeep, fontSize: 12, lineHeight: 14, fontWeight: '700' },
  buy: {
    marginTop: 10,
    height: 36,
    borderRadius: 12,
    backgroundColor: color.raise,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  buyText: { color: ui.brandDeep, fontSize: 13, lineHeight: 16, fontWeight: '700' },
  stepperWide: { marginTop: 10, alignSelf: 'stretch', justifyContent: 'space-between' },
  priceRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 6,
  },
  price: { fontSize: 16, lineHeight: 20 },
  oldPrice: { textDecorationLine: 'line-through', color: color.inkFaint },
  bottom: {
    marginTop: 'auto',
    paddingTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
  },
  plus: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ui.brand,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ui.brandDeep,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.raise,
    borderRadius: 17,
    height: 34,
    paddingHorizontal: 4,
  },
  step: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 18, textAlign: 'center', color: ui.brandDeep, fontWeight: '700' },
});
