/**
 * A faint suzani-like texture: an eight-point star with a pomegranate dot,
 * tiled. Sits under a card's content at a few percent opacity — the one
 * detail that says "Tashkent", not "template". Absolute; parent clips it.
 */
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';

export function Ornament({ color, opacity = 0.09 }: { color: string; opacity?: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="suzani" x="0" y="0" width="56" height="56" patternUnits="userSpaceOnUse">
          <Path
            d="M28 6 L31.5 24.5 L50 28 L31.5 31.5 L28 50 L24.5 31.5 L6 28 L24.5 24.5 Z"
            fill="none"
            stroke={color}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <Circle cx="28" cy="28" r="3" fill={color} />
          <Circle cx="2" cy="2" r="1.4" fill={color} />
          <Circle cx="54" cy="54" r="1.4" fill={color} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#suzani)" opacity={opacity} />
    </Svg>
  );
}
