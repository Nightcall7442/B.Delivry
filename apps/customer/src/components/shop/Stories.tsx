/**
 * Bazaar stories: every stall is a ring — green when the vendor posted this
 * morning's counter photo, grey otherwise. Tap → a full-screen story with the
 * photo, the person behind the counter and one way in. Auto-advances like
 * the format everyone already knows; nothing to learn.
 */
import { tr, type MapStoreDto } from '@bazar/storefront';
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

import { ui } from '@/components/ui/Page';
import { Photo, Text, color, noOutline, press, useLocale } from '@bazar/mobile';

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
    ? new Date(store.counterPhotoAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
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
            <Photo uri={store.logoUrl ?? photoOf(store)} style={s.topAvatar} />
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
              <Text role="body" style={{ color: color.white, fontSize: 20, lineHeight: 22 }}>
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
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    maxWidth: 76,
    textAlign: 'center',
  },
  bazaar: { color: color.inkMuted, fontSize: 10, lineHeight: 12, maxWidth: 76, marginTop: -2 },
  viewer: { flex: 1, backgroundColor: '#0B1020', overflow: 'hidden' },
  zone: { ...StyleSheet.absoluteFillObject, ...(noOutline as object) },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12, gap: 10 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  barFill: { height: 3, borderRadius: 2, backgroundColor: color.white, width: '0%' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  topAvatar: { width: 36, height: 36, borderRadius: 18 },
  topName: { color: color.white, fontWeight: '700', fontSize: 15 },
  topTime: { color: 'rgba(255,255,255,0.8)' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 6 },
  eyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  owner: { color: color.white, fontSize: 26, lineHeight: 30 },
  motto: { color: 'rgba(255,255,255,0.9)', fontSize: 16, lineHeight: 22 },
  cta: {
    marginTop: 12,
    height: 52,
    borderRadius: 16,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: ui.brandDeep, fontWeight: '700' },
});
