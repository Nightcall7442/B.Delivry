/**
 * The price and the stock of one good, on a sheet. The admin cabinet's two fields, with the checks
 * the cabinet does not make: a positive price, a whole stock for pieces, and no quiet «clear» on a
 * good whose stock is counted.
 */
import { Button, scale } from '@bazar/mobile';
import {
  HALL,
  UNIT_LABEL,
  isFractionalUnit,
  priceInputText,
  stallErrorText,
  stockText,
  tr,
  validateProductEdit,
  type ProductEditResult,
  type StallProduct,
} from '@bazar/storefront';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

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
}: {
  product: StallProduct | null;
  onClose: () => void;
  /** Throws when the API refuses: the sheet stays open and says so. */
  onSave: (id: string, update: Update) => Promise<void>;
}) {
  // The sheet slides away over a moment: it keeps the good it was showing until it is gone.
  const last = useRef<StallProduct | null>(null);
  if (product) last.current = product;
  const view = product ?? last.current;

  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [errors, setErrors] = useState<{ price?: string; stock?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!product) return;
    setPrice(priceInputText(product.price.amount, product.price.currency));
    setStock(product.stock === null ? '' : stockText(product.stock));
    setErrors({});
    setFailure(null);
    setBusy(false);
  }, [product]);

  if (!view) return null;
  const unit = UNIT_LABEL[view.unit];

  const submit = async () => {
    const result = validateProductEdit({ price, stock }, view);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!result.changed) {
      onClose();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await onSave(view.id, result.update);
      onClose();
    } catch (error) {
      setFailure(stallErrorText(error, 'Не сохранилось — попробуйте ещё раз'));
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
        label="Цена"
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
