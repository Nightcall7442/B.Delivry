/**
 * Root layout: fonts, the three local stores, a header-less stack. Every
 * screen draws its own top buttons over the map.
 */
import { Alegreya_500Medium_Italic, Alegreya_700Bold, Alegreya_700Bold_Italic } from '@expo-google-fonts/alegreya';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, BrandProvider, LocaleProvider, color } from '@bazar/mobile';
import { AddressProvider } from '@/features/address/store';
import { CartProvider } from '@/features/cart/store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    // The bazaar scenes: a serif for greetings and names, a hand for price signs.
    Alegreya_700Bold,
    Alegreya_700Bold_Italic,
    Alegreya_500Medium_Italic,
    Caveat_700Bold,
  });

  useEffect(() => {
    // A font that fails to load is not a reason to show a blank app.
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AuthProvider>
          <BrandProvider>
            <AddressProvider>
              <CartProvider>
                <StatusBar style="auto" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: color.sand100 },
                    animation: 'fade',
                  }}
                />
              </CartProvider>
            </AddressProvider>
          </BrandProvider>
        </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}
