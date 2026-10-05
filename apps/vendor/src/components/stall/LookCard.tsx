/**
 * «Покажите товар»: customers who want to see a good before they buy it — the cut of the melon, the
 * fat on the lamb. The seller shoots it at the counter and the customer has the photo at once, in a
 * push and on the good's page, where other buyers see it too while it is fresh.
 */
import { Button, Photo, radius, scale } from '@bazar/mobile';
import { HALL, TONE, orderClock, timeLeftText, tr } from '@bazar/storefront';
import type { ProductLookDto } from '@bazar/types';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Bone, LoadError } from '@/components/goods/feedback';
import { Paper, capital, sceneFont } from '@/components/scene';
import type { useLooks } from '@/components/stall/use-looks';

type Looks = ReturnType<typeof useLooks>;

/** The upload route takes nothing else; a phone may hand over HEIC. */
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const asMs = (iso: string) => Date.parse(iso);

export function LookCard({ looks }: { looks: Looks }) {
  const { rows, failed, answering, notice, reload, answer } = looks;
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const now = Date.now();
  const open = (rows ?? [])
    .filter((row) => row.status === 'WAITING')
    .sort((a, b) => asMs(a.expiresAt) - asMs(b.expiresAt));
  const done = (rows ?? []).filter((row) => row.status === 'ANSWERED').slice(0, 5);

  const shoot = async (row: ProductLookDto) => {
    setCameraNote(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setCameraNote('Нет доступа к камере. Разрешите его в настройках телефона.');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    const blob = await fetch(asset.uri).then((response) => response.blob());
    const type =
      [asset.mimeType, blob.type].find((t) => t && UPLOAD_TYPES.includes(t)) ?? 'image/jpeg';
    await answer(row, blob, type);
  };

  return (
    <Paper style={s.card}>
      <View style={s.head}>
        <RNText style={s.label}>Покажите товар</RNText>
        {open.length > 0 ? (
          <View style={s.count} accessible accessibilityLabel={`Ждут фото: ${open.length}`}>
            <RNText style={s.countText}>{open.length}</RNText>
          </View>
        ) : null}
      </View>

      {rows === null ? (
        failed ? (
          <LoadError text="Не удалось загрузить просьбы" onRetry={() => void reload()} />
        ) : (
          <Bone style={{ height: 80 }} />
        )
      ) : open.length === 0 ? (
        <RNText style={s.aside}>
          Сейчас никто не просит. Покупатель может попросить живое фото товара перед покупкой — оно
          придёт сюда и уведомлением.
        </RNText>
      ) : (
        <>
          <RNText style={s.explain}>
            Снимите товар на прилавке — покупатель увидит фото сразу, другие покупатели — на
            странице товара до вечера.
          </RNText>
          {open.map((row) => (
            <View key={row.id} style={s.ask}>
              <RNText style={s.product}>{tr(row.productName, 'ru')}</RNText>
              <RNText style={s.left}>
                Попросили в {orderClock(row.createdAt)} · {timeLeftText(row.expiresAt, now)}
              </RNText>
              <Button
                label={answering === row.id ? 'Отправляем…' : 'Снять и отправить'}
                disabled={answering !== null}
                onPress={() => void shoot(row)}
                accessibilityLabel={`Сфотографировать: ${tr(row.productName, 'ru')}`}
              />
            </View>
          ))}
        </>
      )}

      {failed && rows !== null ? (
        <RNText style={s.error}>Не удалось обновить — список может быть старым</RNText>
      ) : null}
      {notice || cameraNote ? (
        <RNText style={s.error} accessibilityRole="alert">
          {cameraNote ?? notice}
        </RNText>
      ) : null}

      {done.length > 0 ? (
        <View style={s.done}>
          <RNText style={s.label}>Отправленные фото</RNText>
          <View style={s.thumbs}>
            {done.map((row) =>
              row.photoUrl ? (
                <View key={row.id} style={s.thumb}>
                  <Photo uri={row.photoUrl} style={s.thumbPhoto} />
                  <RNText style={s.thumbName} numberOfLines={1}>
                    {tr(row.productName, 'ru')}
                  </RNText>
                  {row.answeredAt ? (
                    <RNText style={s.thumbTime}>{orderClock(row.answeredAt)}</RNText>
                  ) : null}
                </View>
              ) : null,
            )}
          </View>
        </View>
      ) : null}
    </Paper>
  );
}

const s = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...capital, color: TONE.inkSoft },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: HALL.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: sceneFont.heavy,
    fontSize: scale.caption.fontSize,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  aside: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  explain: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft },
  ask: {
    gap: 6,
    padding: 12,
    borderRadius: radius.paper,
    backgroundColor: TONE.creamLight,
    borderWidth: 1,
    borderColor: TONE.paperEdge,
  },
  product: { fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  left: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft, marginBottom: 4 },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  done: { gap: 8, marginTop: 4 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 92, gap: 2 },
  thumbPhoto: { width: 92, height: 92, borderRadius: radius.paper, backgroundColor: TONE.kraft },
  thumbName: { fontFamily: sceneFont.ui, ...scale.caption, color: HALL.ink },
  thumbTime: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft },
});
