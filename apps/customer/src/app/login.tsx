/**
 * Sign in at the gate of the bazaar: the rows in the photograph behind, the
 * greeting and the promise in handwriting, the three guarantees, and the
 * phone form on a paper slip at the bottom. `next` is where the customer was
 * going before we asked who they are.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Display,
  Glass,
  Hand,
  KraftTag,
  SCENES,
  Scene,
  SceneButton,
  isEvening,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import { ArrowLeft, Leaf, LoginForm, Scale, Tag, isDark, useAuth, useT } from '@bazar/mobile';

// The form's type is theme-coloured, so the slip is paper by day and dark kraft in the dark theme.
const SLIP = isDark ? '#2A2014' : scene.paper;

export default function LoginRoute() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user, ready } = useAuth();
  const insets = useSafeAreaInsets();
  const top = useSceneTop();
  const t = useT();
  const evening = isEvening();
  const target = (next && next.startsWith('/') ? next : '/') as Href;

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (ready && user) router.replace(target);
  }, [ready, user, router, target]);

  return (
    <View style={{ flex: 1, backgroundColor: scene.night }}>
      <Scene
        source={evening ? SCENES.evening : SCENES.morning}
        evening={evening}
        style={StyleSheet.absoluteFill}
      >
        <View />
      </Scene>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'flex-end',
            paddingTop: top + 56,
            paddingBottom: 16 + insets.bottom,
          }}
        >
          <View style={s.pitch}>
            <KraftTag>{t('login.taglineHint')}</KraftTag>
            <Display size={38} style={{ marginTop: 14 }}>
              {evening ? t('scene.evening') : t('scene.morning')}
            </Display>
            <Hand size={26}>«{t('login.tagline')}»</Hand>
            <View style={s.pills}>
              {(
                [
                  [Scale, t('trust.weigh')],
                  [Leaf, t('trust.fresh')],
                  [Tag, t('trust.haggle')],
                ] as const
              ).map(([Icon, label]) => (
                <Glass key={label} style={s.pill}>
                  <Icon size={14} color={scene.saffron} />
                  <Text style={s.pillText}>{label}</Text>
                </Glass>
              ))}
            </View>
          </View>

          <View style={s.slip}>
            <View style={s.perforation} />
            <LoginForm onSignedIn={() => router.replace(target)} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {router.canGoBack() ? (
        <SceneButton onPress={() => router.back()} style={{ position: 'absolute', left: 20, top }}>
          <ArrowLeft size={20} color={scene.ink} />
        </SceneButton>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  pitch: { paddingHorizontal: 20, alignItems: 'flex-start', gap: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pill: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: { fontFamily: sceneFont.ui, fontSize: 12, color: scene.cream },
  slip: {
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: SLIP,
    borderRadius: 6,
    padding: 18,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  perforation: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -1,
    height: 3,
    borderStyle: 'dashed',
    borderTopWidth: 3,
    borderColor: isDark ? '#EAD8B2' : '#2B1B0E',
    opacity: 0.25,
  },
});
