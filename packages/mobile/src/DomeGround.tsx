/**
 * «Свет купола» on the phone — the ground under every screen that is not a map
 * or a photograph: the dome's girih over its own shadow, three shafts of light
 * from the windows in the morning, a string of lamps over the rows at night.
 * The tile is the one the web serves (@bazar/storefront `girih`), computed once
 * per launch; only the light moves, and only on the native driver.
 */
import {
  GIRIH_PAINT,
  GROUND,
  girih,
  hallLight,
  type HallLight,
} from '@bazar/storefront';
import { memo, useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

const TILE = girih();

/** Lamps along the wire: x as a share of the width, the wire's sag at that x. */
const LAMPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const WIRE_Y = 62;
const SAG = 28;
const lampY = (x: number) => WIRE_Y + SAG * (1 - ((x - 0.5) / 0.5) ** 2) + 8;

/** Three shafts from the upper right: where each crosses the top edge, as a share of the width. */
const SHAFTS = [
  { x: 0.2, top: 18, bottom: 64, strength: 1 },
  { x: 0.56, top: 14, bottom: 52, strength: 0.75 },
  { x: 0.9, top: 16, bottom: 58, strength: 0.85 },
];
/** tan 14°: the shafts lean as the window light does in the film. */
const LEAN = 0.249;

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

/** Opacity that drifts between `low` and 1 forever — unless the reader asked for stillness. */
function useBreath(low: number, period: number): Animated.Value {
  const value = useRef(new Animated.Value(1)).current;
  const still = useStillness();
  useEffect(() => {
    if (still) {
      value.setValue(1);
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

function Morning({ width, height, id }: { width: number; height: number; id: string }) {
  const breath = useBreath(0.72, 16000);
  const light = GROUND.morning.light;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: breath }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`${id}shaft`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={light} stopOpacity="1" />
            <Stop offset="0.55" stopColor={light} stopOpacity="0.4" />
            <Stop offset="0.92" stopColor={light} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {SHAFTS.map((shaft) => {
          const top = shaft.x * width;
          const bottom = top - height * LEAN;
          // Four nested bands: the edges soften the way a shaft does in dusty air.
          return [1, 0.75, 0.5, 0.28].map((share) => (
            <Polygon
              key={`${shaft.x}-${share}`}
              points={`${top - shaft.top * share},0 ${top + shaft.top * share},0 ${bottom + shaft.bottom * share},${height} ${bottom - shaft.bottom * share},${height}`}
              fill={`url(#${id}shaft)`}
              fillOpacity={0.026 * shaft.strength}
            />
          ));
        })}
      </Svg>
    </Animated.View>
  );
}

function Evening({ width, height, id }: { width: number; height: number; id: string }) {
  const flicker = useBreath(0.9, 6000);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: flicker }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={`${id}glow`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFBE6E" stopOpacity="0.34" />
            <Stop offset="0.4" stopColor="#FFA046" stopOpacity="0.1" />
            <Stop offset="1" stopColor="#FF963C" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}warm`} cx="50%" cy="0%" r="60%">
            <Stop offset="0" stopColor="#FFAA50" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#FFAA50" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height * 0.4} fill={`url(#${id}warm)`} />
        <Path
          d={`M-4 ${WIRE_Y} Q${width / 2} ${WIRE_Y + SAG * 2} ${width + 4} ${WIRE_Y}`}
          stroke="#040810"
          strokeOpacity={0.7}
          strokeWidth={1.2}
          fill="none"
        />
        {LAMPS.map((x) => (
          <G key={x}>
            <Circle cx={x * width} cy={lampY(x)} r={56} fill={`url(#${id}glow)`} />
            <Circle cx={x * width} cy={lampY(x)} r={2.5} fill="#FFECC4" fillOpacity={0.95} />
          </G>
        ))}
      </Svg>
    </Animated.View>
  );
}

/**
 * The hall under a screen. Absolutely fills its parent; put it first, content after.
 * `light` defaults to the Tashkent clock at mount.
 */
export const DomeGround = memo(function DomeGround({ light }: { light?: HallLight }) {
  const { width, height } = useWindowDimensions();
  const hall = light ?? hallLight();
  const ground = GROUND[hall];
  const paint = GIRIH_PAINT[hall];
  // SVG ids are document-wide on the web: one prefix per ground, without useId's colons.
  const id = `dome${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // The tile is centred like the web's `50% 0`: the first column starts at or left of the edge.
  const offset = ((((width - TILE.size) / 2) % TILE.size) + TILE.size) % TILE.size;
  const left = offset > 0 ? offset - TILE.size : 0;
  const tiles: [number, number][] = [];
  for (let y = 0; y < height; y += TILE.size) {
    for (let x = left; x < width; x += TILE.size) tiles.push([x, y]);
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: ground.deep }]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`${id}base`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ground.top} />
            <Stop offset="0.42" stopColor={ground.base} />
            <Stop offset="1" stopColor={ground.deep} />
          </LinearGradient>
          {/* The dome is overhead: the pattern sinks into the shadow of the rows. */}
          <LinearGradient id={`${id}sink`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={ground.deep} stopOpacity="0" />
            <Stop offset="0.42" stopColor={ground.deep} stopOpacity="0.3" />
            <Stop offset="1" stopColor={ground.deep} stopOpacity="0.84" />
          </LinearGradient>
          <RadialGradient id={`${id}vignette`} cx="50%" cy="32%" rx="65%" ry="68%">
            <Stop offset="0.45" stopColor={ground.deep} stopOpacity="0" />
            <Stop offset="1" stopColor={ground.deep} stopOpacity="0.62" />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#${id}base)`} />
        {tiles.map(([x, y]) => (
          <G key={`${x},${y}`} transform={`translate(${x} ${y})`}>
            <Path d={TILE.glaze.turquoise} fill={paint.turquoise} fillOpacity={paint.glazeOpacity} />
            <Path d={TILE.glaze.cobalt} fill={paint.cobalt} fillOpacity={paint.glazeOpacity} />
            <Path d={TILE.glaze.ochre} fill={paint.ochre} fillOpacity={paint.glazeOpacity} />
            <Path
              d={TILE.lines}
              fill="none"
              stroke={paint.line}
              strokeOpacity={paint.lineOpacity}
              strokeWidth={1.1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </G>
        ))}
        <Rect width={width} height={height} fill={`url(#${id}sink)`} />
        <Rect width={width} height={height} fill={`url(#${id}vignette)`} />
      </Svg>
      {hall === 'evening' ? (
        <Evening width={width} height={height} id={id} />
      ) : (
        <Morning width={width} height={height} id={id} />
      )}
    </View>
  );
});

/**
 * One camera for every photograph (web: `.photo-grade`): warm light from the upper left and a
 * soft vignette over the picture. Put it last inside the photo's frame.
 * ponytail: the web's grain and colour filter have no native twin; a noise asset if it shows.
 */
export const PhotoGrade = memo(function PhotoGrade() {
  const id = `grade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const deep = GROUND[hallLight()].deep;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={`${id}warm`} x1="0" y1="0" x2="0.8" y2="0.6">
          <Stop offset="0" stopColor="#FFD696" stopOpacity="0.16" />
          <Stop offset="0.46" stopColor="#FFD696" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id={`${id}vignette`} cx="50%" cy="42%" rx="60%" ry="60%">
          <Stop offset="0.55" stopColor={deep} stopOpacity="0" />
          <Stop offset="1" stopColor={deep} stopOpacity="0.34" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id}warm)`} />
      <Rect width="100%" height="100%" fill={`url(#${id}vignette)`} />
    </Svg>
  );
});
