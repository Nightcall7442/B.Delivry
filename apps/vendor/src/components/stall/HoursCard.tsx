/**
 * The stall's hours: when it opens and closes, and on which days it trades. The admin cabinet writes
 * one time for the whole week; this adds the day off, because a bazaar stall that is shut on Monday
 * is the rule and not the exception. Customers see the hours on the stall's page, and the API
 * refuses orders outside them.
 */
import { Button, api, radius, scale } from '@bazar/mobile';
import {
  HALL,
  STALL_WEEK,
  TONE,
  alpha,
  clockMask,
  daysText,
  hoursDraft,
  hoursUneven,
  stallErrorText,
  validateHours,
  type HoursDraft,
} from '@bazar/storefront';
import type { StoreDto } from '@bazar/types';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { SlipInput } from '@/components/goods/SlipInput';
import { Paper, capital, sceneFont } from '@/components/scene';

const same = (a: HoursDraft, b: HoursDraft) =>
  a.opens === b.opens && a.closes === b.closes && a.days.every((on, day) => on === b.days[day]);

export function HoursCard({
  store,
  onSaved,
}: {
  store: StoreDto;
  /** The stall was changed: read it again. */
  onSaved: () => Promise<void>;
}) {
  const saved = useMemo(() => hoursDraft(store.schedule), [store.schedule]);
  const [draft, setDraft] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const changed = !same(draft, saved);
  const none = store.schedule.length === 0;

  const close = () => {
    setDraft(saved);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const result = validateHours(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api().stores.update(store.id, { schedule: result.schedule });
      await onSaved();
      setEditing(false);
      setDone(true);
    } catch (cause) {
      setError(stallErrorText(cause, 'Не сохранилось — попробуйте ещё раз'));
    } finally {
      setBusy(false);
    }
  };

  const toggleDay = (weekday: number) => {
    setDone(false);
    setDraft({ ...draft, days: draft.days.map((on, day) => (day === weekday ? !on : on)) });
  };

  return (
    <Paper style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText style={s.label}>Часы работы</RNText>
          <RNText style={s.summary}>
            {none
              ? 'Не заданы — заказы не принимаются'
              : `${daysText(saved.days)} · ${saved.opens} – ${saved.closes}`}
          </RNText>
        </View>
        {editing ? null : (
          <Pressable
            onPress={() => {
              setDone(false);
              setEditing(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Изменить часы работы"
            style={({ pressed }) => [s.change, pressed && { opacity: 0.85 }]}
          >
            <RNText style={s.changeText}>Изменить</RNText>
          </Pressable>
        )}
      </View>

      {done && !editing ? (
        <RNText style={s.done} accessibilityLiveRegion="polite">
          Сохранено — покупатели видят новые часы.
        </RNText>
      ) : null}

      {editing ? (
        <View style={s.form}>
          <View style={s.times}>
            <SlipInput
              label="Открываемся"
              value={draft.opens}
              onChangeText={(text) => setDraft({ ...draft, opens: clockMask(text) })}
              keyboardType="number-pad"
              maxLength={5}
              placeholder="07:00"
              selectTextOnFocus
              editable={!busy}
            />
            <SlipInput
              label="Закрываемся"
              value={draft.closes}
              onChangeText={(text) => setDraft({ ...draft, closes: clockMask(text) })}
              keyboardType="number-pad"
              maxLength={5}
              placeholder="18:00"
              selectTextOnFocus
              editable={!busy}
            />
          </View>

          <RNText style={s.label}>Рабочие дни</RNText>
          <View style={s.days}>
            {STALL_WEEK.map(({ weekday, label }) => {
              const on = draft.days[weekday] === true;
              return (
                <Pressable
                  key={weekday}
                  onPress={() => toggleDay(weekday)}
                  disabled={busy}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={label}
                  style={[s.day, on && s.dayOn]}
                >
                  <RNText style={[s.dayText, on && s.dayTextOn]}>{label}</RNText>
                </Pressable>
              );
            })}
          </View>

          {hoursUneven(store.schedule) ? (
            <RNText style={s.hint}>
              Сейчас в разные дни разные часы — после сохранения везде будут эти.
            </RNText>
          ) : null}
          {error ? (
            <RNText style={s.error} accessibilityRole="alert">
              {error}
            </RNText>
          ) : null}

          <View style={s.actions}>
            <Button
              label="Отмена"
              variant="secondary"
              style={{ flex: 1 }}
              disabled={busy}
              onPress={close}
              accessibilityLabel="Закрыть без сохранения"
            />
            <Button
              label={busy ? 'Сохраняем…' : 'Сохранить'}
              style={{ flex: 2 }}
              disabled={busy || !(changed || none)}
              onPress={() => void save()}
              accessibilityLabel="Сохранить часы работы"
            />
          </View>
        </View>
      ) : null}
    </Paper>
  );
}

const s = StyleSheet.create({
  card: { gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...capital, color: TONE.inkSoft },
  summary: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  change: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  changeText: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: HALL.pomegranate,
    textDecorationLine: 'underline',
  },
  done: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  form: { gap: 12, marginTop: 4 },
  times: { flexDirection: 'row', gap: 12 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // A day is a small stamp: ink when the stall trades, kraft when it does not.
  day: {
    flexGrow: 1,
    minWidth: 64,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: TONE.paperEdge,
    backgroundColor: alpha(TONE.kraft, 0.45),
  },
  dayOn: { backgroundColor: HALL.ink, borderColor: HALL.ink },
  dayText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: TONE.inkSoft },
  dayTextOn: { color: TONE.creamLight },
  hint: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  actions: { flexDirection: 'row', gap: 8 },
});
