/**
 * Sign in at the gate of the bazaar: the rows in the photograph behind (the
 * one photograph of the hall — the door keeps it), the greeting and the
 * promise said aloud, the three guarantees, and the phone form on a paper slip
 * at the bottom. `next` is where the customer was going before we asked who
 * they are.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Display,
  Glass,
  KraftTag,
  SCENES,
  Say,
  Scene,
  SceneButton,
  isEvening,
  scene,
  sceneFont,
  useSceneTop,
} from '@/components/bazar';
import {
  ArrowLeft,
  Leaf,
  LoginForm,
  Scale,
  Tag,
  color,
  radius,
  scale,
  shadow,
  useAuth,
  useT,
} from '@bazar/mobile';

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
    <View style={{ flex: 1 }}>
      <Scene
        source={evening ? SCENES.evening : SCENES.morning}
        evening={evening}
        style={StyleSheet.absoluteFill}
      >
        {null}
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
            <Display italic={evening} style={{ marginTop: 14 }}>
              {evening ? t('scene.evening') : t('scene.morning')}
            </Display>
            <Say>«{t('login.tagline')}»</Say>
            <View style={s.pills}>
              {(
                [
                  [Scale, t('trust.weigh')],
                  [Leaf, t('trust.fresh')],
                  [Tag, t('trust.haggle')],
                ] as const
              ).map(([Icon, label]) => (
                <Glass key={label} style={s.pill}>
                  <Icon size={14} color={scene.ochreLight} />
                  <Text style={s.pillText}>{label}</Text>
                </Glass>
              ))}
            </View>
          </View>

          <View style={s.slip}>
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
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.cream },
  // The form's type is theme-coloured, so the slip is the theme's paper (lapis in the dark
  // theme). A slip, not a receipt: no perforated edge.
  slip: {
    marginTop: 20,
    marginHorizontal: 16,
    backgroundColor: color.surface,
    borderRadius: radius.paper,
    padding: 18,
    paddingTop: 20,
    ...shadow.paper,
  },
});
