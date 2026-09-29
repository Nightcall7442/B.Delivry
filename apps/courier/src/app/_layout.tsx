/**
 * Root layout: fonts, the signed-in courier and their shift, a header-less
 * stack. The courier app has three screens (login, shift, history) and no navigation chrome.
 */
import {
  Alegreya_500Medium_Italic,
  Alegreya_700Bold,
  Alegreya_700Bold_Italic,
} from '@expo-google-fonts/alegreya';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { AuthProvider } from '@bazar/mobile';
import { GROUND, hallLight } from '@bazar/storefront';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ShiftProvider } from '@/features/shift';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    // Alegreya names things, its italic is a line said aloud (and the evening greeting). No price
    // signs here, so no Caveat.
    Alegreya_700Bold,
    Alegreya_700Bold_Italic,
    Alegreya_500Medium_Italic,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ShiftProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              // Between screens: the hall's own dark, never a flash of another colour.
              contentStyle: { backgroundColor: GROUND[hallLight()].deep },
              animation: 'fade',
            }}
          />
        </ShiftProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
