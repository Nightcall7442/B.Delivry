/**
 * Sign in as a scene: the hall behind, a greeting for the person on the
 * scooter, the number on a paper slip. No passwords.
 */
import { LoginForm, scale } from '@bazar/mobile';
import { TONE, isEvening } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ground, Paper, capital, sceneFont } from '@/components/scene';

export default function LoginRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const evening = isEvening();
  return (
    <Ground photo dim={0.55}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[s.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={s.greeting}>
          <Text style={s.tag}>Чорсу → дом за 40 минут</Text>
          {/* The evening greeting is said softer: Alegreya italic, as on the site and the app. */}
          <Text style={[s.title, evening && { fontFamily: sceneFont.displayItalic }]}>
            {evening ? 'Хайрли кеч' : 'Хайрли тонг'}
          </Text>
          <Text style={s.line}>За руль — по номеру курьера.</Text>
        </View>
        <Paper>
          <LoginForm title="Bazar Courier" onSignedIn={() => router.replace('/shift')} />
        </Paper>
      </KeyboardAvoidingView>
    </Ground>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 18 },
  greeting: { paddingHorizontal: 4 },
  tag: { ...capital, color: TONE.ochreLight },
  title: {
    fontFamily: sceneFont.display,
    ...scale.display,
    color: TONE.creamLight,
    marginTop: 2,
  },
  // A line said aloud at the door: Alegreya italic.
  line: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.creamMuted, marginTop: 6 },
});
