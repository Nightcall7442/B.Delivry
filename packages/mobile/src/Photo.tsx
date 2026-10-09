/**
 * A product or store photograph in a rounded frame. expo-image underneath:
 * memory + disk cache, a 220 ms fade-in, and the frame keeps its size while
 * the bytes arrive, so lists never jump.
 */
import { photo, type PhotoWidth } from '@bazar/storefront';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  PixelRatio,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { PhotoGrade } from './DomeGround';
import { color, radius } from './theme';

/** The steps `photo()` keeps copies of, smallest first. */
const STEPS: readonly PhotoWidth[] = [250, 500, 960, 1280];

/**
 * The copy to download for a frame: the smallest step that still fills it at up to twice the
 * screen's density. A 56 px avatar takes the 12 KB copy, not the 210 KB original; at 3× a sharper
 * one would be worth little on a phone whose connection is the weak part.
 */
export function stepFor(frame: number, density = PixelRatio.get()): PhotoWidth {
  const need = frame * Math.min(density, 2);
  return STEPS.find((step) => step >= need) ?? 1280;
}

export function Photo({
  uri,
  style,
  fallback,
  priority = 'normal',
  sharedTag,
  grade = true,
  width,
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
  /** The one camera's light over the picture; off only where the photo is a map tile or a logo. */
  grade?: boolean;
  /** The frame's width when the style does not say (a flex or absolute frame): picks the copy. */
  width?: number;
}) {
  const screen = useWindowDimensions().width;
  const flat = StyleSheet.flatten(style);
  const sizes = [flat?.width, flat?.height].filter((n): n is number => typeof n === 'number');
  // A frame of a known size takes what fits it; a hero that fills the screen takes the screen's
  // width; anything else is a tile-sized thing.
  const frame =
    width ?? (sizes.length > 0 ? Math.max(...sizes) : priority === 'high' ? screen : 250);
  const sized = uri ? photo(uri, stepFor(frame)) : null;
  const image = sized ? (
    <Image
      source={{ uri: sized }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      transition={220}
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={sized}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View style={s.fallback}>{fallback}</View>
  );
  return (
    <View style={[s.frame, style]}>
      {sharedTag && sized ? (
        <Animated.View sharedTransitionTag={sharedTag} style={StyleSheet.absoluteFill}>
          {image}
        </Animated.View>
      ) : (
        image
      )}
      {grade && uri ? <PhotoGrade /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: radius.photo, backgroundColor: color.field },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
