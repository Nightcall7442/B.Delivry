/**
 * «Прилавок сейчас»: one photograph a morning, dated by the server. The seller shoots the counter
 * (or picks a photo already taken), the picture goes up to the store-images folder, and the stall's
 * `counterPhotoUrl` points at it — the admin cabinet's flow, with the camera in place of a file input.
 */
import { Button, api, scale } from '@bazar/mobile';
import { HALL, TONE, counterPhotoFresh, placedLabel, stallErrorText } from '@bazar/storefront';
import type { StoreDto } from '@bazar/types';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Paper, capital, sceneFont } from '@/components/scene';

/** The upload route takes nothing else; a phone may hand over HEIC. */
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Source = 'camera' | 'library';

export function CounterPhoto({
  store,
  onChanged,
}: {
  store: StoreDto;
  /** The stall was changed: read it again. */
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<Source | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  const take = async (source: Source) => {
    setNote(null);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setNote({
            text: 'Нет доступа к камере. Разрешите его в настройках телефона или выберите фото из галереи.',
            bad: true,
          });
          return;
        }
      }
      const picked =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset) return;

      setBusy(source);
      const blob = await fetch(asset.uri).then((response) => response.blob());
      const type =
        [asset.mimeType, blob.type].find((t) => t && UPLOAD_TYPES.includes(t)) ?? 'image/jpeg';
      const uploaded = await api().uploads.image('store-images', blob, type);
      await api().stores.update(store.id, { counterPhotoUrl: uploaded.url });
      await onChanged();
      setNote({ text: 'Готово — покупатели видят новое фото прилавка.', bad: false });
    } catch (error) {
      setNote({
        text: stallErrorText(error, 'Фото не загрузилось — попробуйте ещё раз.'),
        bad: true,
      });
    } finally {
      setBusy(null);
    }
  };

  const at = store.counterPhotoAt;
  const hint =
    at === null || store.counterPhotoUrl === null
      ? 'Фото ещё нет. Снимите витрину утром — покупатели увидят, что у вас на прилавке сейчас.'
      : counterPhotoFresh(at)
        ? `Снято ${placedLabel(at)}. Покупатели видят это фото на странице прилавка.`
        : `Снято ${placedLabel(at)}. Снимите витрину заново — покупатели ждут свежее фото.`;

  return (
    <Paper style={s.card}>
      <RNText style={s.label}>Фото прилавка</RNText>
      <RNText style={s.hint}>{hint}</RNText>
      <View style={s.actions}>
        <Button
          label={busy === 'camera' ? 'Загружаем…' : 'Снять витрину'}
          style={{ flex: 1 }}
          disabled={busy !== null}
          onPress={() => void take('camera')}
          accessibilityLabel="Сфотографировать прилавок"
        />
        <Button
          label={busy === 'library' ? 'Загружаем…' : 'Из галереи'}
          variant="secondary"
          style={{ flex: 1 }}
          disabled={busy !== null}
          onPress={() => void take('library')}
          accessibilityLabel="Выбрать фото прилавка из галереи"
        />
      </View>
      {note ? (
        <RNText style={[s.note, note.bad && s.noteBad]} accessibilityLiveRegion="polite">
          {note.text}
        </RNText>
      ) : null}
    </Paper>
  );
}

const s = StyleSheet.create({
  card: { gap: 8 },
  label: { ...capital, color: TONE.inkSoft },
  hint: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.ink },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  note: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  noteBad: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
});
