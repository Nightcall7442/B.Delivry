/**
 * The bazaar's moment of truth: before "Забрал заказ" the courier types what
 * the scale showed for every weighed line and photographs it. The customer
 * sees the weight, the photo and the new total before paying.
 */
import { WEIGHTED_UNITS } from '@bazar/constants';
import { Button, Text, api, color, font, radius } from '@bazar/mobile';
import { UNIT_LABEL, tr } from '@bazar/storefront';
import type { OrderDto, OrderItemDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

interface Line {
  item: OrderItemDto;
  weight: string;
  photoUrl: string | null;
  uploading: boolean;
}

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
          fetched.items
            .filter((item) => WEIGHTED_UNITS.includes(item.unit))
            .map((item) => ({
              item,
              weight: String(item.actualQuantity ?? item.quantity),
              photoUrl: item.weighingPhotoUrl,
              uploading: false,
            })),
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
    setSaving(true);
    setError(null);
    try {
      const items = lines.map((line) => ({
        orderItemId: line.item.id,
        actualQuantity: Number(line.weight.replace(',', '.')),
        ...(line.photoUrl ? { photoUrl: line.photoUrl } : {}),
      }));
      if (items.some((item) => !Number.isFinite(item.actualQuantity) || item.actualQuantity <= 0)) {
        setError('Вес должен быть числом больше нуля');
        return;
      }
      if (items.length > 0) await api().orders.actualQuantities(orderId, items);
      onDone();
    } catch {
      setError('Не удалось сохранить взвешивание');
    } finally {
      setSaving(false);
    }
  };

  if (!order) return <Text role="muted">{error ?? 'Загружаем заказ…'}</Text>;

  const total = lines.reduce(
    (sum, line) =>
      sum + Math.round(line.item.unitPrice.amount * (Number(line.weight.replace(',', '.')) || 0)),
    order.items
      .filter((item) => !WEIGHTED_UNITS.includes(item.unit))
      .reduce((sum, item) => sum + item.total.amount, 0),
  );

  return (
    <View style={s.root}>
      <Text role="display">Взвешивание</Text>
      <Text role="muted">
        {lines.length > 0
          ? 'Введите вес с весов и сфотографируйте их — клиент увидит это до оплаты.'
          : 'В заказе нет весовых товаров — можно забирать.'}
      </Text>

      {lines.map((line) => (
        <View key={line.item.id} style={s.line}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text role="body" numberOfLines={1}>
              {tr(line.item.name, 'ru')}
            </Text>
            <Text role="caption">
              заказано {line.item.quantity} {UNIT_LABEL[line.item.unit]} ·{' '}
              {formatMoney(line.item.unitPrice.amount)} / {UNIT_LABEL[line.item.unit]}
            </Text>
            <View style={s.controls}>
              <TextInput
                value={line.weight}
                onChangeText={(value) =>
                  update(line.item.id, { weight: value.replace(/[^\d.,]/g, '') })
                }
                keyboardType="decimal-pad"
                style={s.input}
                placeholder="0.000"
                placeholderTextColor={color.inkFaint}
              />
              <Text role="muted">{UNIT_LABEL[line.item.unit]}</Text>
              <Pressable
                onPress={() => void shoot(line)}
                disabled={line.uploading}
                style={[s.photo, line.photoUrl ? s.photoDone : null]}
              >
                {line.photoUrl ? (
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
            </View>
          </View>
        </View>
      ))}

      <View style={s.total}>
        <Text role="muted">Итог товаров</Text>
        <Text style={s.totalValue}>{formatMoney(total)}</Text>
      </View>

      {error ? <Text style={{ color: color.danger }}>{error}</Text> : null}

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
  line: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: {
    width: 96,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: color.sand50,
    paddingHorizontal: 12,
    fontSize: 18,
    fontFamily: font.displayBold,
    color: color.ink,
  },
  photo: {
    marginLeft: 'auto',
    height: 44,
    minWidth: 96,
    borderRadius: radius.control,
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
  totalValue: { fontFamily: font.display, fontSize: 20, color: color.ink },
});
