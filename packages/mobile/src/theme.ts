/**
 * Design tokens — the same values as packages/config/tailwind/preset.ts, in the
 * shape StyleSheet wants. Change a colour there, change it here.
 *
 * Two palettes; the system scheme picks one when the app starts. Styles are
 * built at module load, so a scheme change applies on the next launch —
 * ponytail: a theme hook through every StyleSheet if a live switch is wanted.
 */
import { Appearance } from 'react-native';

export const isDark = Appearance.getColorScheme?.() === 'dark';

const LIGHT = {
  ink: '#2B1B0E',
  inkMuted: '#7A6248',
  inkFaint: '#A8987C',
  line: '#DCC8A2',
  lineStrong: '#C9B08A',
  /** The page ground and sheets over the map: cream kraft. */
  surface: '#F3E7CF',
  /** What sits light on a paper tile: buttons, steppers, checkboxes. */
  raise: '#FFFDF7',
  /** Filled inputs and photo placeholders. */
  field: '#EBDCBC',
  /** The paper slip every card sits on. */
  tile: '#FBF5E6',
  /** Matte bars over content (headers, the tab bar) and the fade under a footer. */
  glass: 'rgba(243,231,207,0.9)',
  glassSoft: 'rgba(243,231,207,0.7)',
  fade: ['rgba(243,231,207,0)', 'rgba(243,231,207,0.94)', '#F3E7CF'] as readonly [
    string,
    string,
    string,
  ],
  blurTint: 'light' as 'light' | 'dark',
  brand50: '#F5E0DA',
  brand100: '#EEC8C4',
  saffron100: '#FBEBC9',
  saffron900: '#4A2E05',
  sand50: '#FBF8F2',
  sand100: '#F4EDE1',
  sand200: '#E9DDCB',
  sand300: '#D9C7AC',
};
/** Night at the bazaar: dark kraft, paper one step up, raised things one more; tints flip. */
const DARK: typeof LIGHT = {
  ink: '#FBF1DE',
  inkMuted: '#C9B89A',
  inkFaint: '#8A7A60',
  line: '#3E3020',
  lineStrong: '#5A4830',
  surface: '#1E1408',
  raise: '#4A3B28',
  field: '#2E2216',
  tile: '#2A2014',
  glass: 'rgba(30,20,8,0.9)',
  glassSoft: 'rgba(30,20,8,0.7)',
  fade: ['rgba(30,20,8,0)', 'rgba(30,20,8,0.94)', '#1E1408'],
  blurTint: 'dark',
  brand50: '#3A1B1D',
  brand100: '#4A2224',
  saffron100: '#4A2E05',
  saffron900: '#FBEBC9',
  sand50: '#1F1C18',
  sand100: '#2A251E',
  sand200: '#3A3328',
  sand300: '#5A4E3B',
};

export const color = {
  ...(isDark ? DARK : LIGHT),
  // Pomegranate and saffron — the bazaar scenes' own colours (web keeps its scale).
  brand300: '#D9767A',
  brand400: '#B8474D',
  brand500: '#9E2A2B',
  brand600: '#7E1F21',
  brand950: '#3A0F10',
  saffron400: '#F2B85A',
  saffron500: '#E39B2F',
  saffron600: '#C8851F',
  /** Text on green and on photos — white in both themes. */
  white: '#FFFFFF',
  danger: '#E4394F',
} as const;

export const radius = { control: 10, panel: 16, sheet: 24, pill: 999 } as const;

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

export const shadow = {
  /** Cards sit flat on white — the tile grey separates them, not a shadow. */
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  /** Under primary buttons and the cart disc: the brand colour bleeds into the ground. */
  glow: {
    shadowColor: '#2C56C4',
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  pop: {
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 32,
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
