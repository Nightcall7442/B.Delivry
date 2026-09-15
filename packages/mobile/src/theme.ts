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
  ink: '#161A1F',
  inkMuted: '#6F7783',
  inkFaint: '#A3AAB5',
  line: '#E7EAEE',
  lineStrong: '#CBD1D9',
  /** The page ground and sheets over the map. */
  surface: '#FFFFFF',
  /** What sits white on a grey tile: buttons, steppers, checkboxes. */
  raise: '#FFFFFF',
  /** Filled inputs and photo placeholders. */
  field: '#EFF1F4',
  /** The grey tile every marketplace card sits on. */
  tile: '#F4F5F7',
  /** Matte bars over content (headers, the tab bar) and the fade under a footer. */
  glass: 'rgba(255,255,255,0.9)',
  glassSoft: 'rgba(255,255,255,0.7)',
  fade: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.94)', '#FFFFFF'] as readonly [
    string,
    string,
    string,
  ],
  blurTint: 'light' as 'light' | 'dark',
  brand50: '#EEF3FE',
  brand100: '#DCE6FD',
  saffron100: '#FEF3D7',
  saffron900: '#4A2E05',
  sand50: '#FBF8F2',
  sand100: '#F4EDE1',
  sand200: '#E9DDCB',
  sand300: '#D9C7AC',
};
/** A blue-cool near-black; tiles one step up, raised things one more; tints flip. */
const DARK: typeof LIGHT = {
  ink: '#ECEEF2',
  inkMuted: '#98A1AD',
  inkFaint: '#69727F',
  line: '#272D36',
  lineStrong: '#3B434F',
  surface: '#0F1216',
  raise: '#2A303A',
  field: '#1F242B',
  tile: '#181C22',
  glass: 'rgba(15,18,22,0.9)',
  glassSoft: 'rgba(15,18,22,0.7)',
  fade: ['rgba(15,18,22,0)', 'rgba(15,18,22,0.94)', '#0F1216'],
  blurTint: 'dark',
  brand50: '#14203D',
  brand100: '#1A2A50',
  saffron100: '#4A2E05',
  saffron900: '#FEF3D7',
  sand50: '#1F1C18',
  sand100: '#2A251E',
  sand200: '#3A3328',
  sand300: '#5A4E3B',
};

export const color = {
  ...(isDark ? DARK : LIGHT),
  // Registan cobalt — the same scale as the web preset.
  brand300: '#8FAEF4',
  brand400: '#5F88EC',
  brand500: '#3B6BE3',
  brand600: '#2C56C4',
  brand950: '#0C1A3E',
  saffron400: '#FBBF3B',
  saffron500: '#F5A524',
  saffron600: '#D98407',
  /** Text on green and on photos — white in both themes. */
  white: '#FFFFFF',
  danger: '#E4394F',
} as const;

export const radius = { control: 10, panel: 16, sheet: 24, pill: 999 } as const;

export const font = {
  display: 'Manrope_800ExtraBold',
  displayBold: 'Manrope_700Bold',
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
