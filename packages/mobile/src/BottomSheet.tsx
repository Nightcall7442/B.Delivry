/**
 * The sheet over the map: a white panel that grows from `peek` to full when you
 * drag the handle. Height animates (not offset) so the footer button stays on
 * screen in both states. Plain Animated + PanResponder — no gesture library.
 *
 * ponytail: two snap points, velocity only decides direction. Add a middle
 * snap when a screen needs one.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from './locale';
import { color, radius, shadow } from './theme';

export interface BottomSheetProps {
  /** Share of the screen the collapsed sheet takes. */
  peek?: number;
  expanded?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Sheet colour when a screen is not on the app's surface (the kraft order slip). */
  ground?: string;
}

/** Room above the expanded sheet for the round buttons. */
const TOP_GAP = 68;

export function BottomSheet({
  peek = 0.46,
  expanded: initial = false,
  header,
  footer,
  children,
  ground,
}: BottomSheetProps) {
  const t = useT();
  const { height: screen } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const full = screen - TOP_GAP - insets.top;
  const peekHeight = Math.round(screen * peek);

  const [expanded, setExpanded] = useState(initial);
  const height = useRef(new Animated.Value(initial ? full : peekHeight)).current;
  const start = useRef(initial ? full : peekHeight);
  const rest = useRef(initial ? full : peekHeight);

  const snap = (to: number) => {
    rest.current = to;
    setExpanded(to === full);
    Animated.spring(height, {
      toValue: to,
      useNativeDriver: false,
      damping: 22,
      stiffness: 220,
    }).start();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => {
          start.current = rest.current;
        },
        onPanResponderMove: (_, g) => {
          height.setValue(Math.min(full, Math.max(peekHeight, start.current - g.dy)));
        },
        onPanResponderRelease: (_, g) => {
          // A tap toggles; a drag follows its direction, a slow drag the nearer edge.
          if (Math.abs(g.dy) < 6) return snap(rest.current === full ? peekHeight : full);
          if (Math.abs(g.vy) > 0.4) return snap(g.vy < 0 ? full : peekHeight);
          snap(start.current - g.dy > (full + peekHeight) / 2 ? full : peekHeight);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [full, peekHeight],
  );

  return (
    <Animated.View style={[s.sheet, { height }, ground ? { backgroundColor: ground } : null]}>
      <View {...pan.panHandlers} style={s.grip}>
        <View
          style={s.handle}
          accessible
          accessibilityRole="button"
          accessibilityLabel={expanded ? t('sheet.collapse') : t('sheet.expand')}
          accessibilityState={{ expanded }}
        />
        {header ? <View style={{ paddingTop: 12 }}>{header}</View> : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.body}
        scrollEnabled={expanded}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      {footer ? (
        <View style={[s.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>{footer}</View>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...shadow.pop,
  },
  grip: { paddingHorizontal: 16, paddingTop: 8 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.lineStrong,
  },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    backgroundColor: color.surface,
  },
});
