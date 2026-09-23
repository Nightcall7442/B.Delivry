/**
 * The courier app's slice of the bazaar language: the hall photograph as a
 * ground (morning or evening by Tashkent time), paper slips to write on, kraft
 * for the counter, handwriting for money and asides. Kept small on purpose —
 * a courier needs one big button, not a scene.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, type ViewStyle } from 'react-native';

export const PAPER = '#F4EFE4';
export const PAPER_EDGE = '#C9B99A';
export const KRAFT = '#EAD8B2';
export const INK = '#2B1B0E';
export const INK_MUTED = '#6A5A45';
export const POMEGRANATE = '#9E2A2B';
export const SAFFRON = '#E39B2F';
export const CREAM = '#FBF1DE';
export const CREAM_MUTED = '#D9C7A6';

export const sceneFont = {
  display: 'Alegreya_700Bold',
  hand: 'Caveat_700Bold',
  ui: 'Manrope_600SemiBold',
  uiHeavy: 'Manrope_700Bold',
} as const;

/** Tashkent hour: the bazaar lives on its own clock, not the phone's. */
export const isEvening = () => {
  const hour = (new Date().getUTCHours() + 5) % 24;
  return hour >= 17 || hour < 5;
};

const SCENES = {
  morning: require('../../assets/scenes/morning.jpg'),
  evening: require('../../assets/scenes/evening.jpg'),
};

/** The photograph with a dark scrim, so paper reads on it. */
/**
 * The ground under every shift screen: the night, warm where the lamps are.
 * The photograph of the rows hangs at the door (login) and nowhere else —
 * behind twelve screens in a row it stopped being the bazaar and became
 * wallpaper.
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
  const evening = isEvening();
  if (!photo) {
    return (
      <View style={s.ground}>
        <LinearGradient
          colors={['#241906', '#1E1408', '#160F06']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }
  return (
    <ImageBackground source={SCENES[evening ? 'evening' : 'morning']} style={s.ground}>
      <LinearGradient
        colors={[
          `rgba(30,20,8,${dim - 0.15})`,
          `rgba(30,20,8,${dim})`,
          `rgba(30,20,8,${Math.min(0.96, dim + 0.15)})`,
        ]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </ImageBackground>
  );
}

/** A slip of paper with a dashed edge, the way receipts and price signs look. */
export function Paper({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.paper, style]}>{children}</View>;
}

const s = StyleSheet.create({
  ground: { flex: 1 },
  paper: {
    backgroundColor: PAPER,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E6DCC6',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
});
