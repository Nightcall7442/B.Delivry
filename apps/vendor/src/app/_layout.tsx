/**
 * Root layout: fonts, the signed-in vendor and their stall, a header-less stack — and the banner
 * that stays on top of every screen until a new order has been looked at.
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

import { RingingBanner } from '@/components/RingingBanner';
import { VendorProvider } from '@/features/vendor';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
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
        <VendorProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              // Between screens: the hall's own dark, never a flash of another colour.
              contentStyle: { backgroundColor: GROUND[hallLight()].deep },
              animation: 'fade',
            }}
          />
          <RingingBanner />
        </VendorProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
