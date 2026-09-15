/**
 * The order's thread: customer and courier, a few lines each ("у второго
 * подъезда", "буду через 5 минут"). Lives in @bazar/mobile because both apps
 * draw exactly the same panel, only the side that is "me" differs.
 */
import { room } from '@bazar/api-client';
import { WS_EVENT, type ChatMessageDto } from '@bazar/types';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { api } from './api';
import { useT } from './locale';
import { Button, Field, Text } from './primitives';
import { color, radius } from './theme';

export function OrderChat({
  orderId,
  me,
  onClose,
}: {
  orderId: string;
  /** Which side of the thread the viewer is. */
  me: 'CUSTOMER' | 'COURIER';
  onClose?: () => void;
}) {
  const t = useT();
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    api()
      .orders.messages(orderId)
      .then(setMessages)
      .catch(() => undefined);
    const realtime = api().realtime;
    void realtime.connect();
    realtime.join(room.order(orderId));
    const off = realtime.on(WS_EVENT.ORDER_MESSAGE, (message) => {
      if (message.orderId !== orderId) return;
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
    });
    return off;
  }, [orderId]);

  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const message = await api().orders.sendMessage(orderId, text);
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={s.head}>
        <Text role="title">{t(me === 'COURIER' ? 'chat.customer' : 'chat.title')}</Text>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={8}>
            <Text role="muted">{t('common.close')}</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        ref={scroll}
        style={s.list}
        contentContainerStyle={{ gap: 6, paddingVertical: 8 }}
      >
        {messages.length === 0 ? <Text role="caption">{t('chat.empty')}</Text> : null}
        {messages.map((message) => {
          const mine = message.senderRole === me;
          return (
            <View key={message.id} style={[s.bubble, mine ? s.mine : s.theirs]}>
              <Text role="body" style={mine ? { color: color.white } : undefined}>
                {message.text}
              </Text>
              <Text
                role="caption"
                style={[
                  { fontSize: 10, marginTop: 2 },
                  mine ? { color: 'rgba(255,255,255,0.75)' } : undefined,
                ]}
              >
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={t('chat.placeholder')}
          style={{ flex: 1, height: 44 }}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
        />
        <Button
          label={t('chat.send')}
          disabled={busy || !draft.trim()}
          style={{ height: 44, paddingHorizontal: 16 }}
          onPress={() => void send()}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: color.raise, borderRadius: radius.panel, padding: 12, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  list: { maxHeight: 220 },
  bubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  mine: { alignSelf: 'flex-end', backgroundColor: color.brand500, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.sand100, borderBottomLeftRadius: 4 },
});
