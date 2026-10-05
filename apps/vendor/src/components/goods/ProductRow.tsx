/**
 * One good as a paper slip: the photograph, the name, the price per unit and what is left; under the
 * dashed rule the «В наличии» switch — the button a seller presses a dozen times a morning, so its
 * whole strip is the target. Tapping the top of the slip opens the price and stock.
 */
import { Basket, Edit, Photo, press, scale } from '@bazar/mobile';
import {
  HALL,
  TONE,
  discountPercent,
  UNIT_LABEL,
  isSoldOut,
  stockText,
  tr,
  type StallProduct,
} from '@bazar/storefront';
import { formatMoney } from '@bazar/utils/money';
import { Pressable, StyleSheet, Switch, Text as RNText, View } from 'react-native';

import { Paper, sceneFont } from '@/components/scene';

export function ProductRow({
  product,
  busy,
  onToggle,
  onEdit,
}: {
  product: StallProduct;
  /** The switch is waiting for the API. */
  busy: boolean;
  onToggle: (available: boolean) => void;
  onEdit: () => void;
}) {
  const name = tr(product.name, 'ru') || 'Без названия';
  const unit = UNIT_LABEL[product.unit];
  const soldOut = isSoldOut(product);

  return (
    <Paper>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`${name}, изменить цену и остаток`}
        style={({ pressed }) => [s.main, press.base, pressed && press.down]}
      >
        <View style={[s.top, !product.available && s.off]}>
          {/* A product is framed 4:5, like everywhere else. */}
          <Photo
            uri={product.imageUrl}
            style={s.photo}
            fallback={<Basket size={22} color={TONE.inkSoft} />}
          />
          <View style={s.body}>
            <RNText style={s.name} numberOfLines={2}>
              {name}
            </RNText>
            <RNText style={s.price}>
              {formatMoney(product.price.amount, product.price.currency)} / {unit}
              {product.oldPrice !== null ? (
                <RNText style={s.sale}>
                  {'  '}
                  <RNText style={s.struck}>
                    {formatMoney(product.oldPrice.amount, product.oldPrice.currency)}
                  </RNText>{' '}
                  −{discountPercent(product)} %
                </RNText>
              ) : null}
            </RNText>
            <RNText style={[s.stock, soldOut && s.soldOut]}>
              {product.stock === null
                ? 'Остаток не считается'
                : soldOut
                  ? 'Закончился'
                  : `Остаток ${stockText(product.stock)} ${unit}`}
            </RNText>
          </View>
        </View>
        <Edit size={18} color={TONE.inkSoft} />
      </Pressable>

      <View style={s.rule} />

      <Pressable
        onPress={() => onToggle(!product.available)}
        disabled={busy}
        accessibilityRole="switch"
        accessibilityLabel={`${name}, в наличии`}
        accessibilityState={{ checked: product.available, busy, disabled: busy }}
        style={s.switchRow}
      >
        <RNText style={s.switchLabel}>{product.available ? 'В наличии' : 'Нет в наличии'}</RNText>
        <Switch
          value={product.available}
          disabled={busy}
          onValueChange={onToggle}
          trackColor={{ false: TONE.paperEdge, true: HALL.pomegranate }}
          thumbColor={TONE.creamLight}
        />
      </Pressable>
    </Paper>
  );
}

const s = StyleSheet.create({
  main: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 48 },
  top: { flex: 1, flexDirection: 'row', gap: 12 },
  // What is off the shelf is muted; the switch under it is not.
  off: { opacity: 0.55 },
  photo: { width: 52, height: 65 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: sceneFont.display, ...scale.lead, color: HALL.ink },
  price: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.body,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  stock: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: TONE.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  soldOut: { color: HALL.pomegranate },
  sale: { color: HALL.pomegranate },
  struck: { textDecorationLine: 'line-through', color: TONE.inkSoft },
  // The tear line of a receipt between the good and its switch.
  rule: {
    marginTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: TONE.paperEdge,
  },
  switchRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 8,
  },
  switchLabel: { fontFamily: sceneFont.uiHeavy, ...scale.lead, color: HALL.ink },
});
