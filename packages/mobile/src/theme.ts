/**
 * Design tokens in the shape StyleSheet wants. The colours come from «Свет
 * купола» (@bazar/storefront `HALL`/`TONE`/`GROUND`, the web's globals.css):
 * six from the landing film, everything else one of them lit, shaded or worn.
 *
 * Two palettes; the system scheme picks one when the app starts. Styles are
 * built at module load, so a scheme change applies on the next launch —
 * ponytail: a theme hook through every StyleSheet if a live switch is wanted.
 */
import { GROUND, HALL, TONE, hallLight } from '@bazar/storefront';
import { Appearance } from 'react-native';

export const isDark = Appearance.getColorScheme?.() === 'dark';

const LIGHT = {
  ink: HALL.ink,
  inkMuted: TONE.inkSoft,
  inkFaint: '#A8987C',
  line: '#DCCDB0',
  lineStrong: TONE.paperEdge,
  /** The page ground and sheets over the map: paper. */
  surface: HALL.cream,
  /** What sits light on a paper tile: buttons, steppers, checkboxes. */
  raise: '#FFFDF7',
  /** Filled inputs and photo placeholders: kraft. */
  field: TONE.kraft,
  /** The paper slip every card sits on. */
  tile: '#FBF8F1',
  /** Matte bars over content (headers, the tab bar) and the fade under a footer. */
  glass: 'rgba(244,239,228,0.9)',
  glassSoft: 'rgba(244,239,228,0.7)',
  fade: ['rgba(244,239,228,0)', 'rgba(244,239,228,0.94)', HALL.cream] as readonly [
    string,
    string,
    string,
  ],
  blurTint: 'light' as 'light' | 'dark',
  /** Errors are pomegranate — there is no seventh colour for them; lit on the dark. */
  danger: HALL.pomegranate,
  brand50: '#F5E0DA',
  brand100: '#EEC8C4',
  saffron100: '#FBEBC9',
  saffron900: '#4A2E05',
  sand50: '#FBF8F2',
  sand100: '#F4EDE1',
  sand200: '#E9DDCB',
  sand300: '#D9C7AC',
};
/** The dark palette has the light one's keys; its values are its own. */
type Palette = {
  [K in keyof typeof LIGHT]: (typeof LIGHT)[K] extends 'light' | 'dark'
    ? 'light' | 'dark'
    : (typeof LIGHT)[K] extends string
      ? string
      : (typeof LIGHT)[K];
};
/** The bazaar after the lamps are lit: lapis, paper one step up, raised one more; tints flip. */
const DARK: Palette = {
  ink: TONE.creamLight,
  inkMuted: TONE.creamMuted,
  inkFaint: '#8B96B0',
  line: '#263454',
  lineStrong: '#3A4B70',
  surface: HALL.lapis,
  raise: '#243662',
  field: '#1D2D54',
  tile: TONE.lapisLit,
  glass: 'rgba(14,26,51,0.9)',
  glassSoft: 'rgba(14,26,51,0.7)',
  fade: ['rgba(14,26,51,0)', 'rgba(14,26,51,0.94)', HALL.lapis],
  blurTint: 'dark',
  danger: TONE.pomegranateLit,
  brand50: '#3A1B1D',
  brand100: '#4A2224',
  saffron100: '#4A2E05',
  saffron900: '#FBEBC9',
  sand50: TONE.lapisLit,
  sand100: '#1D2D54',
  sand200: '#2C3E68',
  sand300: '#485A84',
};

export const color = {
  ...(isDark ? DARK : LIGHT),
  // Pomegranate and ochre (still called saffron in the scale the web shares).
  brand300: '#D9767A',
  brand400: '#B8474D',
  brand500: HALL.pomegranate,
  brand600: TONE.pomegranateDeep,
  brand950: '#3A0F10',
  saffron400: TONE.ochreLight,
  saffron500: HALL.ochre,
  saffron600: TONE.ochreDeep,
  /** Text on green and on photos — white in both themes. */
  white: '#FFFFFF',
} as const;

/** Three corners: paper (every sheet, slip, field and sign), photographs, and pills (buttons, glass). */
export const radius = { paper: 6, photo: 14, pill: 999 } as const;

/**
 * One scale for every screen (the web's --fs-*): nothing between its steps.
 * Alegreya names things, Manrope runs the interface, Caveat is only the
 * vendor's hand on a price sign.
 */
export const scale = {
  caption: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  lead: { fontSize: 17, lineHeight: 24 },
  title: { fontSize: 22, lineHeight: 26 },
  headline: { fontSize: 30, lineHeight: 34 },
  display: { fontSize: 44, lineHeight: 46 },
} as const;

export const font = {
  display: 'Manrope_800ExtraBold',
  displayBold: 'Manrope_700Bold',
  /** Headings: the bazaar's serif. Both apps load it next to Manrope. */
  heading: 'Alegreya_700Bold',
  // One family for everything (full Cyrillic and Uzbek Latin); the apps load all four faces.
  body: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
} as const;

/** A `fontWeight` in a style picks the face; custom fonts do not synthesise weights natively. */
export const FACE: Record<string, string> = {
  normal: font.body,
  '400': font.body,
  '500': font.body,
  '600': font.bodySemi,
  bold: font.displayBold,
  '700': font.displayBold,
  '800': font.display,
  '900': font.display,
};

/**
 * One shadow for everything that lifts off the ground — the ground's own dark,
 * never black (web: --shadow). What lies on paper lies flat.
 */
export const shadow = {
  paper: {
    shadowColor: GROUND[hallLight()].deep,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

/**
 * Press feedback without a gesture library: the pressed style shrinks the
 * surface a little, and on the web a CSS transition eases it (native applies
 * it instantly — still a clear touch response).
 */
export const press = {
  base: {
    transitionProperty: 'transform, opacity',
    transitionDuration: '140ms',
  } as unknown as import('react-native').ViewStyle,
  down: { transform: [{ scale: 0.97 }] } as import('react-native').ViewStyle,
};

/** RN-web draws the browser focus ring around inputs; our fields have their own frame. */
export const noOutline = { outlineStyle: 'none' } as unknown as import('react-native').TextStyle;
