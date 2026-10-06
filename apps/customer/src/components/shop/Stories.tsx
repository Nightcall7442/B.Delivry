/**
 * Bazaar stories: every stall is a ring — green when the vendor posted this
 * morning's counter photo, grey otherwise. Tap → a full-screen story with the
 * photo, the person behind the counter and one way in. Auto-advances like
 * the format everyone already knows; nothing to learn.
 */
import { createT } from '@bazar/i18n';
import { TONE, alpha, tr, type MapStoreDto } from '@bazar/storefront';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { caps, ground, scene, sceneFont } from '@/components/bazar';
import { ui } from '@/components/ui/Page';
import {
  Photo,
  Text,
  color,
  noOutline,
  press,
  radius,
  scale,
  shadow,
  useLocale,
} from '@bazar/mobile';

const STORY_MS = 5000;

const hasLive = (store: MapStoreDto) => Boolean(store.counterPhotoUrl);
const photoOf = (store: MapStoreDto) => store.counterPhotoUrl ?? store.coverUrl ?? null;
/** «Зелёный ряд, Чорсу» → ['Зелёный ряд', 'Чорсу']: the stall first, the bazaar under it. */
const stall = (name: string) => {
  const [head, ...rest] = name.split(/,\s*/);
  return [head ?? name, rest.join(', ')] as const;
};
const timeOf = (store: MapStoreDto) =>
  store.counterPhotoAt
    ? // The Tashkent clock, the same for every language: not the phone's zone and its AM/PM.
      createT('ru').time(store.counterPhotoAt)
    : null;

export function Stories({ stores }: { stores: readonly MapStoreDto[] }) {
  const { locale } = useLocale();
  const [open, setOpen] = useState<number | null>(null);
  const rows = stores.filter((store) => photoOf(store));
  if (rows.length === 0) return null;
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.rail}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingVertical: 4 }}
      >
        {rows.map((store, i) => (
          <Pressable
            key={store.id}
            onPress={() => setOpen(i)}
            style={({ pressed }) => [s.item, press.base, pressed && press.down]}
            accessibilityRole="button"
            accessibilityLabel={tr(store.name, locale)}
          >
            <LinearGradient
              colors={hasLive(store) ? [ui.brand, color.brand300] : [color.line, color.line]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={s.ring}
            >
              <View style={s.ringInner}>
                <Photo uri={photoOf(store)} style={s.avatar} />
              </View>
            </LinearGradient>
            <Text role="caption" numberOfLines={2} style={s.name}>
              {stall(tr(store.name, locale))[0]}
            </Text>
            {stall(tr(store.name, locale))[1] ? (
              <Text role="caption" numberOfLines={1} style={s.bazaar}>
                {stall(tr(store.name, locale))[1]}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      {open !== null ? (
        <StoryViewer stores={rows} start={open} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

export function StoryViewer({
  stores,
  start,
  onClose,
  cta = true,
}: {
  stores: readonly MapStoreDto[];
  start: number;
  onClose: () => void;
  /** Off when the story is opened from the store's own screen. */
  cta?: boolean;
}) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start);
  const progress = useRef(new Animated.Value(0)).current;
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const store = stores[index]!;

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= stores.length) return onClose();
    setIndex(next);
  };
  // Plays the bar from `from` to full; a hold stops it, the release resumes from where it was.
  const play = (from: number) => {
    run.current?.stop();
    run.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_MS * (1 - from),
      useNativeDriver: false,
    });
    run.current.start(({ finished }) => finished && go(1));
  };
  const pause = () => progress.stopAnimation();
  const resume = () => progress.stopAnimation((value) => play(value));
  useEffect(() => {
    progress.setValue(0);
    play(0);
    return () => run.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Swipes: sideways flips the story, pulling down closes it; the card follows the finger.
  const actions = useRef({ go, onClose });
  actions.current = { go, onClose };
  const drag = useRef(new Animated.ValueXY()).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 || g.dy > 12,
      onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 && g.dy > Math.abs(g.dx)) return actions.current.onClose();
        if (g.dx < -50) actions.current.go(1);
        else if (g.dx > 50) actions.current.go(-1);
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () =>
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(),
    }),
  ).current;
  const dy = drag.y.interpolate({
    inputRange: [0, 300],
    outputRange: [0, 300],
    extrapolate: 'clamp',
  });
  const scale = drag.y.interpolate({
    inputRange: [0, 300],
    outputRange: [1, 0.88],
    extrapolate: 'clamp',
  });

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        style={[s.viewer, { transform: [{ translateX: drag.x }, { translateY: dy }, { scale }] }]}
        {...pan.panHandlers}
      >
        <Photo uri={photoOf(store)} style={StyleSheet.absoluteFill} priority="high" />
        {/* The scrims carry the photograph into the ground, top and bottom. */}
        <LinearGradient
          colors={[ground(0.55), ground(0), ground(0), ground(0.75)]}
          locations={[0, 0.25, 0.6, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* tap zones: left third back, the rest forward; a hold pauses and does not flip */}
        {[
          { side: { right: '66%' } as const, delta: -1 },
          { side: { left: '34%' } as const, delta: 1 },
        ].map(({ side, delta }) => (
          <Pressable
            key={delta}
            style={[s.zone, side]}
            onPress={() => go(delta)}
            onPressIn={pause}
            onPressOut={resume}
            onLongPress={() => undefined}
            delayLongPress={250}
          />
        ))}

        <View style={[s.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
          <View style={s.bars}>
            {stores.map((row, i) => (
              <View key={row.id} style={s.bar}>
                <Animated.View
                  style={[
                    s.barFill,
                    i < index && { width: '100%' },
                    i === index && {
                      width: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={s.topRow}>
            {/* A logo is not a photograph: no grade on it. */}
            <Photo
              uri={store.logoUrl ?? photoOf(store)}
              grade={!store.logoUrl}
              style={s.topAvatar}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text role="body" numberOfLines={1} style={s.topName}>
                {tr(store.name, locale)}
              </Text>
              <Text role="caption" style={s.topTime}>
                {timeOf(store)
                  ? `${t('store.counterNow')} · ${t('store.counterAt', { time: timeOf(store) ?? '' })}`
                  : t('store.prep', { minutes: store.preparationMinutes })}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={s.close}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text role="body" style={s.closeText}>
                ×
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[s.bottom, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
          {store.ownerName ? (
            <>
              <Text role="caption" style={s.eyebrow}>
                {t('store.owner').toUpperCase()}
              </Text>
              <Text role="display" style={s.owner}>
                {store.ownerName}
              </Text>
              {store.ownerMotto ? (
                <Text role="body" style={s.motto} numberOfLines={3}>
                  «{tr(store.ownerMotto, locale)}»
                </Text>
              ) : null}
            </>
          ) : (
            <Text role="display" style={s.owner}>
              {tr(store.name, locale)}
            </Text>
          )}
          {cta ? (
            <Pressable
              onPress={() => {
                onClose();
                router.push({ pathname: '/store/[storeId]', params: { storeId: store.id } });
              }}
              style={({ pressed }) => [s.cta, press.base, pressed && press.down]}
            >
              <Text role="body" style={s.ctaText}>
                {t('story.open')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  rail: { marginHorizontal: -16 },
  item: { width: 76, alignItems: 'center', gap: 4 },
  ring: { width: 68, height: 68, borderRadius: 34, padding: 2.5 },
  ringInner: {
    flex: 1,
    borderRadius: 32,
    padding: 2.5,
    backgroundColor: color.surface,
  },
  avatar: { flex: 1, borderRadius: 30 },
  name: {
    color: color.ink,
    ...scale.caption,
    fontWeight: '600',
    maxWidth: 76,
    textAlign: 'center',
  },
  bazaar: { color: color.inkMuted, ...scale.caption, maxWidth: 76, marginTop: -2 },
  // The story is a photograph over the ground: cream type, ochre capitals, the pomegranate button.
  viewer: { flex: 1, backgroundColor: ground(1), overflow: 'hidden' },
  zone: { ...StyleSheet.absoluteFill, ...(noOutline as object) },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12, gap: 10 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: alpha(TONE.creamLight, 0.35),
  },
  barFill: { height: 3, borderRadius: radius.pill, backgroundColor: scene.cream, width: '0%' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topAvatar: { width: 36, height: 36, borderRadius: 18 },
  topName: { fontFamily: sceneFont.display, ...scale.body, color: scene.cream },
  topTime: { color: scene.creamMuted },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: scene.cream, ...scale.title },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 6 },
  eyebrow: { ...caps, color: scene.ochreLight },
  owner: { color: scene.cream },
  motto: { fontFamily: sceneFont.italic, ...scale.lead, color: scene.cream },
  cta: {
    marginTop: 12,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
    // Over the photograph it lifts, like every CTA over the ground.
    ...shadow.paper,
  },
  ctaText: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
});
