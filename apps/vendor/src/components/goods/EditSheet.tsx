/**
 * The price and the stock of one good, on a sheet. The admin cabinet's two fields, with the checks
 * the cabinet does not make: a positive price, a whole stock for pieces, and no quiet «clear» on a
 * good whose stock is counted. And the «честная скидка»: the seller types the new price only, the
 * customer sees the lowest price of last week struck through; a good on sale shows that price and
 * a way to end the sale. And quantity prices — «от 10 кг по 16 000», «3 шт за 10 000» — three steps
 * at most, checked by the API's own rule before they are sent.
 */
import { Button, scale } from '@bazar/mobile';
import { SALE } from '@bazar/constants';
import {
  HALL,
  TONE,
  UNIT_LABEL,
  discountPercent,
  isFractionalUnit,
  isSetPriced,
  parseSaleInput,
  parseTierRows,
  priceInputText,
  sameTiers,
  stallErrorText,
  stockText,
  tierRowsOf,
  tr,
  validateProductEdit,
  type PriceTier,
  type ProductEditResult,
  type StallProduct,
  type TierRow,
} from '@bazar/storefront';
import type { MoneyDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Sheet } from '@/components/goods/Sheet';
import { SlipInput } from '@/components/goods/SlipInput';
import { sceneFont } from '@/components/scene';

type Update = Extract<ProductEditResult, { ok: true }>['update'];

/** Figures only: the keyboard of a phone lets a seller type anything. */
const figures = (text: string) => text.replace(/[^\d\s.,]/g, '');

export function EditSheet({
  product,
  onClose,
  onSave,
  onSale,
  onEndSale,
  onTiers,
}: {
  product: StallProduct | null;
  onClose: () => void;
  /** Throws when the API refuses: the sheet stays open and says so. */
  onSave: (id: string, update: Update) => Promise<void>;
  /** Starts a sale at this price; throws when the API refuses. */
  onSale: (id: string, price: MoneyDto) => Promise<void>;
  onEndSale: (id: string) => Promise<void>;
  /** Replaces the quantity prices (per unit); throws when the API refuses. */
  onTiers: (id: string, tiers: PriceTier[], currency: string) => Promise<void>;
}) {
  // The sheet slides away over a moment: it keeps the good it was showing until it is gone.
  const last = useRef<StallProduct | null>(null);
  if (product) last.current = product;
  const view = product ?? last.current;

  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [sale, setSale] = useState('');
  const [tierRows, setTierRows] = useState<TierRow[]>([]);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [errors, setErrors] = useState<{
    price?: string;
    stock?: string;
    sale?: string;
    tiers?: string;
  }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!product) return;
    setPrice(priceInputText(product.price.amount, product.price.currency));
    setStock(product.stock === null ? '' : stockText(product.stock));
    setSale('');
    setTierRows(tierRowsOf(product));
    setTiersOpen(product.tiers.length > 0);
    setErrors({});
    setFailure(null);
    setBusy(false);
  }, [product]);

  if (!view) return null;
  const unit = UNIT_LABEL[view.unit];
  const onSaleNow = view.oldPrice !== null;

  const submit = async () => {
    const result = validateProductEdit({ price, stock }, view);
    // The cut and the quantity prices are measured against the price as the seller leaves it here.
    const cut = result.ok ? parseSaleInput(sale, result.update.price) : null;
    const ladder = result.ok
      ? parseTierRows(tierRows, { ...view, price: result.update.price })
      : null;
    if (!result.ok || (cut !== null && !cut.ok) || (ladder !== null && !ladder.ok)) {
      setErrors({
        ...(result.ok ? {} : result.errors),
        ...(cut !== null && !cut.ok ? { sale: cut.error } : {}),
        ...(ladder !== null && !ladder.ok ? { tiers: ladder.error } : {}),
      });
      return;
    }
    setErrors({});
    // On sale, a lower price is a deeper cut — the honest path, struck at the week's lowest; any
    // other change of the price is an edit, and an edit ends the sale (the API's rule).
    const deeper = view.oldPrice !== null && result.update.price.amount < view.price.amount;
    const update = deeper ? { ...result.update, price: view.price } : result.update;
    const edited = deeper
      ? result.update.stock !== undefined && result.update.stock !== view.stock
      : result.changed;
    const salePrice = deeper ? result.update.price.amount : cut?.ok ? cut.value : null;
    const tiers = ladder?.ok && !sameTiers(ladder.value, view.tiers) ? ladder.value : null;
    if (!edited && salePrice === null && tiers === null) {
      onClose();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      if (edited) await onSave(view.id, update);
      if (tiers !== null) await onTiers(view.id, tiers, result.update.price.currency);
      if (salePrice !== null)
        await onSale(view.id, { amount: salePrice, currency: result.update.price.currency });
      onClose();
    } catch (error) {
      setFailure(stallErrorText(error, 'Не сохранилось — попробуйте ещё раз'));
    } finally {
      setBusy(false);
    }
  };

  const endSale = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onEndSale(view.id);
      onClose();
    } catch (error) {
      setFailure(stallErrorText(error, 'Скидка осталась — попробуйте ещё раз'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={product !== null}
      title={tr(view.name, 'ru') || 'Без названия'}
      onClose={onClose}
      busy={busy}
    >
      <SlipInput
        label={onSaleNow ? 'Цена со скидкой' : 'Цена'}
        suffix={`сум / ${unit}`}
        value={price}
        onChangeText={(text) => setPrice(figures(text))}
        keyboardType="decimal-pad"
        selectTextOnFocus
        error={errors.price}
        editable={!busy}
      />
      <SlipInput
        label="Остаток"
        suffix={unit}
        value={stock}
        onChangeText={(text) => setStock(figures(text))}
        keyboardType={isFractionalUnit(view.unit) ? 'decimal-pad' : 'number-pad'}
        placeholder="Не считаю"
        selectTextOnFocus
        error={errors.stock}
        hint={
          view.stock === null
            ? 'Пусто — остаток не считается, товар продаётся, пока он включён'
            : 'Покупатели не закажут больше, чем здесь записано'
        }
        editable={!busy}
      />
      {view.oldPrice !== null ? (
        <View style={s.sale}>
          <RNText style={s.saleText}>
            Скидка −{discountPercent(view)} %: покупатель видит{' '}
            <RNText style={s.struck}>
              {formatMoney(view.oldPrice.amount, view.oldPrice.currency)}
            </RNText>{' '}
            зачёркнутой. Цена ниже — скидка станет глубже, выше — скидка снимется.
          </RNText>
          <Button
            label="Снять скидку"
            variant="secondary"
            disabled={busy}
            onPress={() => void endSale()}
            accessibilityLabel="Снять скидку и вернуть обычную цену"
          />
        </View>
      ) : (
        <SlipInput
          label="Скидка — новая цена"
          suffix={`сум / ${unit}`}
          value={sale}
          onChangeText={(text) => setSale(figures(text))}
          keyboardType="decimal-pad"
          placeholder="Без скидки"
          error={errors.sale}
          hint={`Зачёркнутой покупатель увидит самую низкую цену за ${SALE.REFERENCE_DAYS} дней — скидка честная. У кого товар в избранном, получат уведомление.`}
          editable={!busy}
        />
      )}
      {tiersOpen ? (
        <View style={s.tiers}>
          <RNText style={s.tiersTitle}>
            {isSetPriced(view.unit) ? 'Оптом и «3 за …»' : 'Оптом дешевле'}
          </RNText>
          {tierRows.map((row, i) => (
            <View key={i} style={s.tierRow}>
              <SlipInput
                label={isSetPriced(view.unit) ? `Сколько, ${unit}` : `От, ${unit}`}
                value={row.quantity}
                onChangeText={(text) =>
                  setTierRows((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, quantity: figures(text) } : r)),
                  )
                }
                keyboardType={isFractionalUnit(view.unit) ? 'decimal-pad' : 'number-pad'}
                editable={!busy}
              />
              <SlipInput
                label={isSetPriced(view.unit) ? 'За все, сум' : `По, сум / ${unit}`}
                value={row.price}
                onChangeText={(text) =>
                  setTierRows((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, price: figures(text) } : r)),
                  )
                }
                keyboardType="decimal-pad"
                editable={!busy}
              />
            </View>
          ))}
          <RNText style={errors.tiers ? s.failure : s.tiersHint}>
            {errors.tiers ??
              (isSetPriced(view.unit)
                ? 'Например, 3 шт за 10 000: столько возьмут — столько и заплатят. Пустые строки — без акции.'
                : 'Например, от 10 кг по 16 000: цена за весь заказ, кто берёт больше. Пустые строки — без опта.')}
          </RNText>
        </View>
      ) : (
        <Pressable
          onPress={() => setTiersOpen(true)}
          disabled={busy}
          accessibilityRole="button"
          hitSlop={8}
          style={{ alignSelf: 'flex-start' }}
        >
          <RNText style={s.tiersLink}>
            {isSetPriced(view.unit) ? '+ Оптом или «3 за …»' : '+ Оптом дешевле'}
          </RNText>
        </Pressable>
      )}
      {failure ? (
        <RNText style={s.failure} accessibilityRole="alert">
          {failure}
        </RNText>
      ) : null}
      <View style={s.actions}>
        <Button
          label="Отмена"
          variant="secondary"
          style={{ flex: 1 }}
          disabled={busy}
          onPress={onClose}
          accessibilityLabel="Закрыть без сохранения"
        />
        <Button
          label={busy ? 'Сохраняем…' : 'Сохранить'}
          style={{ flex: 2 }}
          disabled={busy}
          onPress={() => void submit()}
          accessibilityLabel="Сохранить цену и остаток"
        />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  failure: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  sale: { gap: 10 },
  saleText: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft },
  struck: { textDecorationLine: 'line-through', color: HALL.ink },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tiers: { gap: 8, marginTop: 4 },
  tiersTitle: { fontFamily: sceneFont.heavy, ...scale.body, color: HALL.ink },
  tierRow: { flexDirection: 'row', gap: 8 },
  tiersHint: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft },
  tiersLink: { fontFamily: sceneFont.heavy, ...scale.body, color: HALL.pomegranate },
});
