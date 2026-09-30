/**
 * «Не смогу собрать»: the confirmation before an order is given up. A reason is required — the
 * customer is told it — and is one tap on a chip, with a line for details; «Другая причина» needs
 * its own words. The sheet does not close while the request is in flight.
 */
import { Button, press, radius, scale } from '@bazar/mobile';
import {
  DECLINE_NOTE_MAX,
  DECLINE_REASONS,
  DECLINE_REASON_LABEL,
  GROUND,
  HALL,
  TONE,
  alpha,
  declineText,
  hallLight,
  type DeclineReason,
} from '@bazar/storefront';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { capital, sceneFont } from '@/components/scene';

export function DeclineSheet({
  visible,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<DeclineReason | null>(null);
  const [note, setNote] = useState('');
  const text = declineText(reason, note);
  const close = busy ? undefined : onClose;

  // The sheet opens clean every time.
  useEffect(() => {
    if (!visible) {
      setReason(null);
      setNote('');
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={close}
          style={[StyleSheet.absoluteFill, s.scrim]}
        />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <View style={s.grip} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
            <RNText style={s.title}>Не сможете собрать заказ?</RNText>
            <RNText style={s.aside}>Заказ будет отменён, клиент получит уведомление.</RNText>

            <View accessibilityRole="radiogroup" style={s.chips}>
              {DECLINE_REASONS.map((each) => {
                const chosen = each === reason;
                return (
                  <Pressable
                    key={each}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: chosen, disabled: busy }}
                    disabled={busy}
                    onPress={() => setReason(each)}
                    style={({ pressed }) => [
                      s.chip,
                      chosen && s.chipChosen,
                      press.base,
                      pressed && press.down,
                    ]}
                  >
                    <RNText style={[s.chipText, chosen && s.chipTextChosen]}>
                      {DECLINE_REASON_LABEL[each]}
                    </RNText>
                  </Pressable>
                );
              })}
            </View>

            {reason ? (
              <View>
                <RNText style={s.label}>
                  {reason === 'OTHER' ? 'Напишите причину' : 'Уточните, если нужно'}
                </RNText>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  editable={!busy}
                  multiline
                  maxLength={DECLINE_NOTE_MAX}
                  accessibilityLabel="Причина отказа"
                  placeholder={reason === 'OTHER' ? 'Что случилось?' : 'Например, какой товар'}
                  placeholderTextColor={TONE.inkSoft}
                  style={s.input}
                />
              </View>
            ) : null}

            {error ? (
              <RNText accessibilityRole="alert" style={s.error}>
                {error}
              </RNText>
            ) : null}

            <View style={s.actions}>
              <Button
                label={busy ? 'Секунду…' : 'Отменить заказ'}
                variant="danger"
                accessibilityRole="button"
                disabled={busy || text === null}
                onPress={() => text !== null && onSubmit(text)}
              />
              <Button
                label="Назад"
                variant="secondary"
                accessibilityRole="button"
                disabled={busy}
                onPress={onClose}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: alpha(GROUND[hallLight()].deep, 0.6) },
  sheet: {
    maxHeight: '88%',
    backgroundColor: HALL.cream,
    borderTopLeftRadius: radius.paper,
    borderTopRightRadius: radius.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: TONE.paperEdge,
  },
  grip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: TONE.paperEdge,
    marginTop: 8,
  },
  content: { padding: 16, gap: 12 },
  title: { fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  aside: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TONE.creamLight,
    borderWidth: 1,
    borderColor: TONE.paperEdge,
  },
  // The chosen one is stamped in ink: pomegranate stays on the button.
  chipChosen: { backgroundColor: HALL.ink, borderColor: HALL.ink },
  chipText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: HALL.ink },
  chipTextChosen: { color: TONE.creamLight },
  label: { ...capital, color: TONE.inkSoft, marginBottom: 4 },
  // A line to write on: kraft wash, dashed rule underneath.
  input: {
    minHeight: 56,
    borderRadius: radius.paper,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: TONE.paperEdge,
    backgroundColor: alpha(TONE.kraft, 0.45),
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontFamily: sceneFont.ui,
    fontSize: scale.lead.fontSize,
    color: HALL.ink,
  },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  actions: { gap: 8, marginTop: 4 },
});
