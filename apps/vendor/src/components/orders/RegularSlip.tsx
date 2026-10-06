/**
 * «Свой покупатель»: the seller remembers. On an order, who has come back and how many times, what
 * they always take, what they asked for on their lines before — and the seller's own note about
 * them («кость отдельно»), kept for the next time. The customer never sees the note.
 */
import { Button, api, scale } from '@bazar/mobile';
import { HALL, TONE, dateLabel, stallErrorText, tr } from '@bazar/storefront';
import type { OrderDto, RegularDto } from '@bazar/types';
import { useEffect, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { NoteInput } from '@/components/goods/NoteInput';
import { Paper, capital, sceneFont } from '@/components/scene';

export function RegularSlip({ order }: { order: OrderDto }) {
  const [regular, setRegular] = useState<RegularDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api()
      .regulars.ofOrder(order.id)
      .then((value) => alive && setRegular(value))
      // The memory is a help, not the order: without it the slip stays away.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [order.id]);

  if (regular === null) return null;
  const name = order.customer?.firstName?.trim() || null;
  const back = regular.previousOrders > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setRegular(await api().regulars.setNote(order.id, { note: draft }));
      setEditing(false);
    } catch (cause) {
      setError(stallErrorText(cause, 'Не сохранилось — попробуйте ещё раз'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper style={back ? { ...s.card, ...s.back } : s.card}>
      <RNText style={s.label}>{back ? 'Свой покупатель' : 'Новый покупатель'}</RNText>
      <RNText style={s.headline}>
        {back
          ? `${name ? `${name} — ` : ''}${regular.previousOrders + 1}-й заказ у вас`
          : `${name ? `${name} — ` : ''}первый заказ у вас`}
      </RNText>
      {back && regular.since ? (
        <RNText style={s.line}>Покупает у вас с {dateLabel(regular.since)}</RNText>
      ) : null}
      {regular.usual.length > 0 ? (
        <RNText style={s.line}>
          Обычно берёт: {regular.usual.map((item) => tr(item.name, 'ru')).join(', ')}
        </RNText>
      ) : null}
      {regular.wishes.length > 0 ? (
        <RNText style={s.line}>
          Пожелания в прошлых заказах: {regular.wishes.map((wish) => `«${wish}»`).join(', ')}
        </RNText>
      ) : null}

      {editing ? (
        <View style={s.edit}>
          <RNText style={s.label}>Ваша заметка о покупателе</RNText>
          <NoteInput
            value={draft}
            onChangeText={setDraft}
            maxLength={200}
            placeholder="Кость отдельно, любит постное"
            accessibilityLabel="Ваша заметка о покупателе"
            autoFocus
          />
          <RNText style={s.hint}>Видите только вы — покупатель её не видит.</RNText>
          <View style={s.pair}>
            <Button
              label={saving ? 'Сохраняем…' : 'Запомнить'}
              style={{ flex: 1 }}
              disabled={saving}
              onPress={() => void save()}
            />
            <Button
              label="Отмена"
              variant="secondary"
              style={{ flex: 1 }}
              disabled={saving}
              onPress={() => setEditing(false)}
            />
          </View>
          {error ? (
            <RNText style={s.error} accessibilityRole="alert">
              {error}
            </RNText>
          ) : null}
        </View>
      ) : (
        <View style={s.noteRow}>
          <RNText style={regular.note ? s.note : s.noteEmpty}>
            {regular.note
              ? `Ваша заметка: «${regular.note}»`
              : 'Запомните, что он любит — заметка появится в его следующих заказах'}
          </RNText>
          <Button
            label={regular.note ? 'Изменить' : 'Заметка'}
            variant="secondary"
            onPress={() => {
              setDraft(regular.note ?? '');
              setError(null);
              setEditing(true);
            }}
            accessibilityLabel="Заметка о покупателе"
          />
        </View>
      )}
    </Paper>
  );
}

const s = StyleSheet.create({
  card: { gap: 6 },
  // A returning customer is good news: the paper gets the ochre edge of the stall's own notes.
  back: { borderColor: HALL.ochre, borderWidth: 1.5 },
  label: { ...capital, color: TONE.inkSoft },
  headline: { fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  line: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.ink },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  note: { flex: 1, fontFamily: sceneFont.italic, ...scale.lead, color: HALL.ink },
  noteEmpty: { flex: 1, fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft },
  edit: { gap: 8, marginTop: 6 },
  pair: { flexDirection: 'row', gap: 8 },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  hint: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft },
});
