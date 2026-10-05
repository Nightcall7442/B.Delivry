/**
 * The bazaar's moment of truth: before "Забрал заказ" the courier says what was actually bought.
 * Weighed lines: what the scale showed, photographed. Counted lines: as many as the stall had.
 * Any line the stall did not have at all is «Нет у продавца» — it leaves the bill and the order
 * goes on (the customer is told, and paid back if they already paid); only when nothing is left
 * does the order fail. The customer sees all of it and the new total before paying.
 */
import { WEIGHTED_UNITS } from '@bazar/constants';
import { isApiError } from '@bazar/api-client';
import { Button, Text, api, color, font, radius, scale } from '@bazar/mobile';
import { SUBSTITUTION_TEXT, UNIT_LABEL, tr } from '@bazar/storefront';
import type { OrderDto, OrderItemDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

interface Line {
  item: OrderItemDto;
  weighed: boolean;
  /** Weighed lines: the scale, as typed. */
  weight: string;
  /** Counted lines: how many the stall had, 0…ordered. */
  count: number;
  /** «Нет у продавца»: the line leaves the bill. */
  missing: boolean;
  photoUrl: string | null;
  uploading: boolean;
}

const weightOf = (line: Line) => Number(line.weight.replace(',', '.'));
/** What the line comes to: nothing when missing, else the scale or the count. */
const boughtOf = (line: Line) => (line.missing ? 0 : line.weighed ? weightOf(line) : line.count);

export function WeighingSheet({
  orderId,
  busy,
  onDone,
}: {
  orderId: string;
  busy: boolean;
  /** Called once the actual quantities are saved; the caller taps "picked up" next. */
  onDone: () => void;
}) {
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api()
      .orders.get(orderId)
      .then((fetched) => {
        setOrder(fetched);
        setLines(
          fetched.items.map((item) => {
            const weighed = WEIGHTED_UNITS.includes(item.unit);
            const bought = item.actualQuantity ?? item.quantity;
            return {
              item,
              weighed,
              weight: String(bought),
              count: bought,
              missing: item.actualQuantity === 0,
              photoUrl: item.weighingPhotoUrl,
              uploading: false,
            };
          }),
        );
      })
      .catch(() => setError('Не удалось загрузить заказ'));
  }, [orderId]);

  const update = (id: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.item.id === id ? { ...line, ...patch } : line)),
    );

  const shoot = async (line: Line) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    const picked =
      permission?.granted === false
        ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 })
        : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;

    update(line.item.id, { uploading: true });
    try {
      const blob = await fetch(asset.uri).then((response) => response.blob());
      const type = asset.mimeType ?? blob.type ?? 'image/jpeg';
      const uploaded = await api().uploads.image('weighing', blob, type);
      update(line.item.id, { photoUrl: uploaded.url, uploading: false });
    } catch {
      update(line.item.id, { uploading: false });
      setError('Фото не загрузилось — попробуйте ещё раз');
    }
  };

  const save = async () => {
    setError(null);
    if (lines.some((line) => line.weighed && !line.missing && !(weightOf(line) > 0))) {
      setError('Вес должен быть числом больше нуля — или отметьте «Нет у продавца»');
      return;
    }
    if (lines.length > 0 && lines.every((line) => boughtOf(line) === 0)) {
      setError('Ничего не нашлось — тогда «Назад» → «Не собрать» → «Ничего нет»');
      return;
    }
    // Weighed lines always (the scale is the point); counted ones only when bought short.
    const items = lines
      .filter(
        (line) =>
          line.weighed || boughtOf(line) !== (line.item.actualQuantity ?? line.item.quantity),
      )
      .map((line) => ({
        orderItemId: line.item.id,
        actualQuantity: boughtOf(line),
        ...(line.photoUrl && !line.missing ? { photoUrl: line.photoUrl } : {}),
      }));
    setSaving(true);
    try {
      if (items.length > 0) await api().orders.actualQuantities(orderId, items);
      onDone();
    } catch (cause) {
      setError(
        isApiError(cause) && cause.status === 409
          ? 'Вес сильно отличается от заказанного или заказ уже изменился — проверьте весы, при необходимости позвоните оператору'
          : 'Не удалось сохранить взвешивание',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!order) return <Text role="muted">{error ?? 'Загружаем заказ…'}</Text>;

  const total = lines.reduce(
    (sum, line) => sum + Math.round(line.item.unitPrice.amount * (boughtOf(line) || 0)),
    0,
  );
  const gone = lines.filter((line) => boughtOf(line) === 0);
  const less = lines.filter(
    (line) => !line.weighed && boughtOf(line) > 0 && boughtOf(line) < line.item.quantity,
  );

  return (
    <View style={s.root}>
      <Text role="display">Что купили</Text>
      <Text role="muted">
        Вес — с весов и с фото. Чего нет у продавца — отметьте: позиция уйдёт из счёта, заказ не
        отменится.
      </Text>
      <View style={s.wish}>
        <Text role="caption" style={{ color: color.ink }}>
          {SUBSTITUTION_TEXT[order.substitutionPolicy].courier}
        </Text>
      </View>

      {lines.map((line) => {
        const unit = UNIT_LABEL[line.item.unit];
        return (
          <View key={line.item.id} style={[s.line, line.missing && s.lineGone]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text role="body" numberOfLines={1} style={line.missing ? s.struck : undefined}>
                {tr(line.item.name, 'ru')}
              </Text>
              <Text role="caption" style={s.figures}>
                заказано {line.item.quantity} {unit} · {formatMoney(line.item.unitPrice.amount)} /{' '}
                {unit}
              </Text>
              <View style={s.controls}>
                {line.missing ? (
                  <Text role="muted" style={{ flex: 1 }}>
                    Нет у продавца — из счёта уберём
                  </Text>
                ) : line.weighed ? (
                  <>
                    <TextInput
                      value={line.weight}
                      onChangeText={(value) =>
                        update(line.item.id, { weight: value.replace(/[^\d.,]/g, '') })
                      }
                      keyboardType="decimal-pad"
                      style={s.input}
                      placeholder="0.000"
                      placeholderTextColor={color.inkFaint}
                      accessibilityLabel={`Вес: ${tr(line.item.name, 'ru')}`}
                    />
                    <Text role="muted">{unit}</Text>
                    <Pressable
                      onPress={() => void shoot(line)}
                      disabled={line.uploading}
                      style={[s.photo, line.photoUrl ? s.photoDone : null]}
                    >
                      {line.photoUrl ? (
                        // Evidence of the weight, not a picture of the goods: shown as shot, no grade.
                        <Image source={{ uri: line.photoUrl }} style={s.thumb} />
                      ) : (
                        <Text
                          role="caption"
                          style={{ color: line.uploading ? color.inkFaint : color.brand600 }}
                        >
                          {line.uploading ? 'Грузим…' : 'Фото весов'}
                        </Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      onPress={() => update(line.item.id, { count: Math.max(0, line.count - 1) })}
                      disabled={line.count <= 0}
                      style={[s.step, line.count <= 0 && { opacity: 0.4 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Меньше"
                    >
                      <Text role="title">−</Text>
                    </Pressable>
                    <Text role="title" style={s.figures}>
                      {line.count} {unit}
                    </Text>
                    <Pressable
                      onPress={() =>
                        update(line.item.id, {
                          count: Math.min(line.item.quantity, line.count + 1),
                        })
                      }
                      disabled={line.count >= line.item.quantity}
                      style={[s.step, line.count >= line.item.quantity && { opacity: 0.4 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Больше"
                    >
                      <Text role="title">+</Text>
                    </Pressable>
                  </>
                )}
              </View>
              <Pressable
                onPress={() => update(line.item.id, { missing: !line.missing })}
                hitSlop={8}
                style={{ marginTop: 6, alignSelf: 'flex-start' }}
                accessibilityRole="switch"
                accessibilityState={{ checked: line.missing }}
              >
                <Text role="caption" style={{ color: color.brand600 }}>
                  {line.missing ? 'Всё-таки есть' : 'Нет у продавца'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {gone.length > 0 || less.length > 0 ? (
        <Text role="caption" style={{ color: color.ink }}>
          Клиенту напишем, чего не было, и пересчитаем сумму
          {gone.length > 0 ? ` · нет: ${gone.length}` : ''}
          {less.length > 0 ? ` · меньше: ${less.length}` : ''}
        </Text>
      ) : null}

      <View style={s.total}>
        <Text role="muted">Итог товаров</Text>
        <Text style={s.totalValue}>{formatMoney(total)}</Text>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Button
        label={saving || busy ? 'Секунду…' : 'Сохранить и забрать'}
        disabled={saving || busy || lines.some((line) => line.uploading)}
        onPress={() => void save()}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 8 },
  wish: {
    backgroundColor: color.sand50,
    borderRadius: radius.paper,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  line: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  lineGone: { opacity: 0.7 },
  struck: { textDecorationLine: 'line-through' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: {
    width: 96,
    height: 44,
    borderRadius: radius.paper,
    backgroundColor: color.sand50,
    paddingHorizontal: 12,
    fontSize: scale.lead.fontSize,
    fontFamily: font.displayBold,
    fontVariant: ['tabular-nums'],
    color: color.ink,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.sand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    marginLeft: 'auto',
    height: 44,
    minWidth: 96,
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: color.brand300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  photoDone: { borderColor: color.brand500, padding: 0 },
  thumb: { width: 96, height: 44 },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
  },
  totalValue: {
    fontFamily: font.display,
    ...scale.title,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  figures: { fontVariant: ['tabular-nums'] },
  // Pomegranate, as on the shift sheet: the palette's one red, and it reads on paper.
  error: { ...scale.body, color: color.brand500 },
});
