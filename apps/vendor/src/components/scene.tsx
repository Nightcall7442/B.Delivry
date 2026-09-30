/**
 * The seller app's slice of the bazaar language: the hall under the screens,
 * the photograph of the rows at the door, paper slips to write on, kraft for
 * the counter. Colours are «Свет купола» (@bazar/storefront HALL/TONE/GROUND).
 * Kept small on purpose — a seller at the counter needs big buttons, not a scene.
 */
import { DomeGround, PhotoGrade, font, radius, scale, shadow } from '@bazar/mobile';
import { GROUND, HALL, TONE, alpha, hallLight } from '@bazar/storefront';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';

/** Alegreya names things (italic: a line said aloud); Manrope runs the interface. */
export const sceneFont = {
  display: font.heading,
  /** The evening greeting: the lamps are lit, the hall speaks softer. */
  displayItalic: 'Alegreya_700Bold_Italic',
  italic: 'Alegreya_500Medium_Italic',
  ui: font.bodySemi,
  uiHeavy: font.displayBold,
  heavy: font.display,
} as const;

/** The one capital: Manrope 800, 12 px, 0.14em, caps — ochre on the ground, ink-soft on paper. */
export const capital: TextStyle = {
  fontFamily: sceneFont.heavy,
  ...scale.caption,
  letterSpacing: scale.caption.fontSize * 0.14,
  textTransform: 'uppercase',
};

const SCENES = {
  morning: require('../../assets/scenes/morning.jpg'),
  evening: require('../../assets/scenes/evening.jpg'),
};

/**
 * The ground under a screen: the hall. The photograph of the rows hangs at the
 * door (login) and nowhere else — behind twelve screens in a row it stopped
 * being the bazaar and became wallpaper.
 */
export function Ground({
  children,
  photo = false,
  dim = 0.75,
}: {
  children: ReactNode;
  /** The rows themselves behind the paper — the door (login) and nowhere else. */
  photo?: boolean;
  dim?: number;
}) {
  const hall = hallLight();
  if (!photo) {
    return (
      <View style={s.ground}>
        <DomeGround light={hall} />
        {children}
      </View>
    );
  }
  // Graded like every photograph, then dimmed into the ground's own dark so paper reads on it.
  const deep = GROUND[hall].deep;
  return (
    <ImageBackground source={SCENES[hall]} style={s.ground}>
      <PhotoGrade />
      <LinearGradient
        colors={[
          alpha(deep, dim - 0.15),
          alpha(deep, dim),
          alpha(deep, Math.min(0.96, dim + 0.15)),
        ]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </ImageBackground>
  );
}

/**
 * A slip of paper. Over the ground it lifts with the one shadow; `flat` when it
 * lies on another sheet — what lies on paper lies flat.
 */
export function Paper({
  children,
  style,
  flat = false,
}: {
  children: ReactNode;
  style?: ViewStyle;
  flat?: boolean;
}) {
  return <View style={[s.paper, !flat && shadow.paper, style]}>{children}</View>;
}

const s = StyleSheet.create({
  ground: { flex: 1 },
  paper: {
    backgroundColor: HALL.cream,
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: alpha(TONE.paperEdge, 0.4),
    padding: 16,
  },
});
