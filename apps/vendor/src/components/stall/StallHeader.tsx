/**
 * The stall as a customer meets it at the counter: the photograph of it as it is now, the name, the
 * place in the rows, and whether it is open this minute. With several stalls a strip of pills above
 * says which one the whole app is about.
 */
import { Camera, Photo, press, radius, scale } from '@bazar/mobile';
import {
  GROUND,
  HALL,
  TONE,
  alpha,
  hallLight,
  isOpenAt,
  storeStatusNote,
  todayHoursText,
  tr,
} from '@bazar/storefront';
import type { StoreDto } from '@bazar/types';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';

import { Paper, capital, sceneFont } from '@/components/scene';

/**
 * The page's own clock: the stall opens and closes by the hour, and «Открыт» must turn over then
 * without a pull to refresh (the stall is read from the API only when something changes).
 */
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

// The name alone: the stand number is under the name in the card, and a pill cut it to «· М…».
const pillLabel = (store: StoreDto) => tr(store.name, 'ru');

export function StallHeader({
  stores,
  store,
  onSelect,
}: {
  stores: readonly StoreDto[];
  store: StoreDto;
  onSelect: (id: string) => void;
}) {
  const note = storeStatusNote(store.status);
  const now = useNow(30_000);
  // The API's own rule (an active stall inside today's hours), read on the phone's clock.
  const open = isOpenAt(store, now);
  // The section is remounted for every stall: the strip starts at the chosen pill, not at the first.
  const strip = useRef<ScrollView>(null);
  return (
    <View style={s.root}>
      {stores.length > 1 ? (
        <ScrollView
          ref={strip}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.pillsScroll}
          contentContainerStyle={s.pills}
          accessibilityRole="tablist"
        >
          {stores.map((row) => {
            const active = row.id === store.id;
            return (
              <Pressable
                key={row.id}
                onPress={() => onSelect(row.id)}
                onLayout={
                  active
                    ? (event) =>
                        strip.current?.scrollTo({
                          x: Math.max(0, event.nativeEvent.layout.x - 16),
                          animated: false,
                        })
                    : undefined
                }
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Прилавок ${pillLabel(row)}`}
                style={({ pressed }) => [
                  s.pill,
                  active && s.pillActive,
                  press.base,
                  pressed && press.down,
                ]}
              >
                <RNText style={[s.pillText, active && s.pillTextActive]} numberOfLines={1}>
                  {pillLabel(row)}
                </RNText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Paper style={s.card}>
        <Photo
          uri={store.counterPhotoUrl ?? store.coverUrl}
          priority="high"
          style={s.photo}
          fallback={<Camera size={28} color={TONE.inkSoft} />}
        />
        <View style={s.line}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <RNText style={s.name} numberOfLines={3}>
              {tr(store.name, 'ru')}
            </RNText>
            {store.standNumber ? (
              <RNText style={s.stand}>Ряд / место: {store.standNumber}</RNText>
            ) : null}
          </View>
          {/* The rubber stamp of the counter: ink while it trades, worn when it is shut. */}
          <View
            style={[s.stamp, !open && s.stampShut]}
            accessible
            accessibilityLabel={open ? 'Сейчас открыт' : 'Сейчас закрыт'}
          >
            <RNText style={[s.stampText, !open && s.stampTextShut]}>
              {open ? 'Открыт' : 'Закрыт'}
            </RNText>
          </View>
        </View>
        <RNText style={s.hours}>{todayHoursText(store.schedule, now)}</RNText>
        {note ? <RNText style={s.note}>{note}</RNText> : null}
      </Paper>
    </View>
  );
}

const s = StyleSheet.create({
  root: { gap: 12 },
  // The strip runs to the screen's edges; the first pill still starts at the gutter.
  pillsScroll: { marginHorizontal: -16 },
  pills: { paddingHorizontal: 16, gap: 8 },
  // Glass over the ground, as the courier's back button: the hall's own base at half strength.
  pill: {
    minHeight: 48,
    maxWidth: 260,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: alpha(GROUND[hallLight()].base, 0.55),
    borderWidth: 1,
    borderColor: alpha(TONE.creamLight, 0.22),
  },
  pillActive: { backgroundColor: HALL.cream, borderColor: HALL.ochre },
  pillText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: TONE.creamLight },
  pillTextActive: { color: HALL.ink },
  card: { gap: 10 },
  photo: { width: '100%', height: 176 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: sceneFont.display, ...scale.headline, color: HALL.ink },
  stand: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft, marginTop: 2 },
  stamp: {
    borderWidth: 2,
    borderColor: HALL.ink,
    borderRadius: radius.paper,
    paddingHorizontal: 10,
    paddingVertical: 3,
    transform: [{ rotate: '-4deg' }],
  },
  stampShut: { borderColor: TONE.inkSoft },
  stampText: { ...capital, color: HALL.ink },
  stampTextShut: { color: TONE.inkSoft },
  hours: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.lead,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  note: { fontFamily: sceneFont.italic, ...scale.lead, color: HALL.pomegranate },
});
