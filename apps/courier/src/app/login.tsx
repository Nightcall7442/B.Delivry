import { LoginForm, color } from '@bazar/mobile';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoginRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}
    >
      <View style={s.panel}>
        <LoginForm title="Bazar Courier" onSignedIn={() => router.replace('/shift')} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: color.brand950, padding: 16 },
  panel: { backgroundColor: color.white, borderRadius: 24, padding: 20 },
});
