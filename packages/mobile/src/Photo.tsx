/**
 * A product or store photograph in a rounded frame. expo-image underneath:
 * memory + disk cache, a 220 ms fade-in, and the frame keeps its size while
 * the bytes arrive, so lists never jump.
 */
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { color } from './theme';

export function Photo({
  uri,
  style,
  fallback,
  priority = 'normal',
  sharedTag,
}: {
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  /** Shown when there is no photograph: an icon, never an emoji. */
  fallback?: ReactNode;
  /** `high` for the hero of a screen, so it lands before the thumbnails. */
  priority?: 'low' | 'normal' | 'high';
  /**
   * The same tag on a tile and on the next screen's hero makes the photo fly
   * between them (Reanimated shared element, native stack only; ignored on web).
   */
  sharedTag?: string;
}) {
  const image = uri ? (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      transition={220}
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={uri}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View style={s.fallback}>{fallback}</View>
  );
  return (
    <View style={[s.frame, style]}>
      {sharedTag && uri ? (
        <Animated.View sharedTransitionTag={sharedTag} style={StyleSheet.absoluteFill}>
          {image}
        </Animated.View>
      ) : (
        image
      )}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: color.field },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
