/**
 * «Свет купола» on the phone — the ground under every screen that is not a map
 * or a photograph: the dome's girih over its own shadow, three shafts of light
 * from the windows in the morning, a string of lamps over the rows at night.
 *
 * The hall is two pictures per light, rendered from the web's own CSS layers
 * (`assets/hall`, see its README): the ground (tile, sink, vignette, grain) and
 * its light. A phone composites two bitmaps; only the light breathes, as an
 * opacity on a hardware layer. Drawn as live SVG, the girih made old Android
 * phones redraw thousands of path segments on the CPU every frame.
 */
import { GROUND, hallLight, type HallLight } from '@bazar/storefront';
import { Image } from 'expo-image';
import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';

const HALL_GROUND = {
  morning: require('../assets/hall/hall-morning-ground.webp'),
  evening: require('../assets/hall/hall-evening-ground.webp'),
} as const;
const HALL_LIGHT = {
  morning: require('../assets/hall/hall-morning-light.png'),
  evening: require('../assets/hall/hall-evening-light.png'),
} as const;
const PHOTO_GRADE = require('../assets/hall/photo-grade.png');

function useStillness(): boolean {
  const [still, setStill] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setStill(value));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return still;
}

/**
 * Opacity that drifts between `low` and 1 forever — unless the reader asked for stillness, or the
 * phone is an Android: there an endless animation keeps the window redrawing every frame on every
 * mounted screen, which old phones pay for in scrolling. The light then rests between its stops.
 */
function useBreath(low: number, period: number): Animated.Value {
  const value = useRef(new Animated.Value(1)).current;
  const still = useStillness() || Platform.OS === 'android';
  useEffect(() => {
    if (still) {
      value.setValue((low + 1) / 2);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: low, duration: period / 2, useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: period / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, still, low, period]);
  return value;
}

/**
 * The hall under a screen. Absolutely fills its parent; put it first, content after.
 * `light` defaults to the Tashkent clock at mount. The pictures are anchored at the top, where
 * the lamps hang, and cover the rest.
 */
export const DomeGround = memo(function DomeGround({ light }: { light?: HallLight }) {
  const hall = light ?? hallLight();
  const evening = hall === 'evening';
  // Morning shafts breathe slowly; the lamps flicker a little.
  const breath = useBreath(evening ? 0.9 : 0.72, evening ? 6000 : 16000);
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: GROUND[hall].deep }]}
      pointerEvents="none"
    >
      <Image
        source={HALL_GROUND[hall]}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top"
        transition={0}
        cachePolicy="memory"
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, { opacity: breath }]}
        renderToHardwareTextureAndroid
        shouldRasterizeIOS
      >
        <Image
          source={HALL_LIGHT[hall]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={0}
          cachePolicy="memory"
        />
      </Animated.View>
    </View>
  );
});

/**
 * One camera for every photograph (web: `.photo-grade`): warm light from the upper left and a
 * soft vignette over the picture — one small bitmap stretched over the frame, shared by every
 * photo on screen. Put it last inside the photo's frame.
 * ponytail: the web's grain and colour filter have no native twin; a noise asset if it shows.
 */
export const PhotoGrade = memo(function PhotoGrade() {
  return (
    <Image
      source={PHOTO_GRADE}
      style={StyleSheet.absoluteFill}
      contentFit="fill"
      transition={0}
      cachePolicy="memory"
    />
  );
});
