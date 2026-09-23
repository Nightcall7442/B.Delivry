/**
 * Sign in as a scene: the hall behind, a greeting for the person on the
 * scooter, the number on a paper slip. No passwords.
 */
import { LoginForm } from '@bazar/mobile';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CREAM, CREAM_MUTED, Ground, Paper, isEvening, sceneFont } from '@/components/scene';

export default function LoginRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Ground photo dim={0.55}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[s.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}
      >
        <View style={s.greeting}>
          <Text style={s.tag}>Чорсу → дом за 40 минут</Text>
          <Text style={s.title}>{isEvening() ? 'Хайрли кеч' : 'Хайрли тонг'}</Text>
          <Text style={s.line}>За руль — по номеру курьера. Без паролей.</Text>
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
  tag: { fontFamily: sceneFont.hand, fontSize: 20, color: CREAM_MUTED },
  title: {
    fontFamily: sceneFont.display,
    fontSize: 44,
    lineHeight: 48,
    color: CREAM,
    marginTop: 2,
  },
  line: { fontFamily: sceneFont.hand, fontSize: 22, color: CREAM_MUTED, marginTop: 6 },
});
