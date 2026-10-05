/**
 * The seller's own number on the phone: the Telegram bot that carries new orders when the app is
 * closed, and the way out.
 */
import { Chat, Chevron, api, press, scale, useAuth } from '@bazar/mobile';
import { HALL, TONE, stallErrorText } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Paper, sceneFont } from '@/components/scene';
import { formatUzPhone } from '@bazar/utils/phone';

export function TelegramCard() {
  const { user, refresh } = useAuth();
  const [note, setNote] = useState<string | null>(null);
  // The bot binds the chat while the app is in the background: read the profile again on return.
  const opened = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && opened.current) {
        opened.current = false;
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const connect = async () => {
    setNote(null);
    try {
      const { url } = await api().notifications.telegramLink();
      opened.current = true;
      await Linking.openURL(url);
    } catch (error) {
      opened.current = false;
      setNote(stallErrorText(error, 'Не удалось открыть Telegram — проверьте, что он установлен'));
    }
  };

  const linked = user?.telegramLinked === true;
  return (
    <Paper>
      <Pressable
        onPress={() => void connect()}
        accessibilityRole="button"
        accessibilityLabel="Получать заказы в Telegram"
        style={({ pressed }) => [s.row, press.base, pressed && press.down]}
      >
        <Chat size={24} color={HALL.pomegranate} strokeWidth={2.2} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText style={s.title}>Получать заказы в Telegram</RNText>
          <RNText style={s.sub}>
            {linked
              ? 'Подключён — новые заказы приходят в чат, даже когда приложение закрыто'
              : 'Откройте бота и нажмите «Старт» — новые заказы придут в чат, даже когда приложение закрыто'}
          </RNText>
        </View>
        <Chevron size={20} color={TONE.inkSoft} />
      </Pressable>
      {note ? (
        <RNText style={s.error} accessibilityRole="alert">
          {note}
        </RNText>
      ) : null}
    </Paper>
  );
}

export function SignOut() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  return (
    <Pressable
      onPress={() => {
        void signOut().then(() => router.replace('/login'));
      }}
      accessibilityRole="button"
      accessibilityLabel="Выйти из аккаунта"
      style={s.signOut}
    >
      {/* The number as it is said aloud; «Выйти» looks like what it is — the thing to tap. */}
      <RNText style={s.signOutText}>
        {user?.phone ? `${formatUzPhone(user.phone)} · ` : ''}
        <RNText style={s.signOutAction}>Выйти</RNText>
      </RNText>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: sceneFont.display, ...scale.lead, color: HALL.ink },
  sub: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft, marginTop: 2 },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate, marginTop: 8 },
  signOut: { alignSelf: 'center', minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  signOutAction: {
    fontFamily: sceneFont.uiHeavy,
    color: TONE.ochreLight,
    textDecorationLine: 'underline',
  },
  signOutText: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: TONE.creamMuted,
    fontVariant: ['tabular-nums'],
  },
});
