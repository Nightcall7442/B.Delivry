/**
 * A slip of paper that rises over the screen for one small job — a price, a stock, a counter offer.
 * The sheet is the stall's own dialog: a scrim in the hall's dark, paper on it, the keyboard kept
 * clear of the fields.
 */
import { radius, scale, shadow } from '@bazar/mobile';
import { GROUND, HALL, TONE, alpha, hallLight } from '@bazar/storefront';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sceneFont } from '@/components/scene';

export function Sheet({
  visible,
  title,
  onClose,
  busy = false,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** A request is in flight: the sheet stays until it answers. */
  busy?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.fill}>
        <Pressable
          style={s.scrim}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
        />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grip} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.content}
          >
            <RNText style={s.title} accessibilityRole="header">
              {title}
            </RNText>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  // The ground's own dark, never black.
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: alpha(GROUND[hallLight()].deep, 0.6),
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: HALL.cream,
    borderTopLeftRadius: radius.paper,
    borderTopRightRadius: radius.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: TONE.paperEdge,
    ...shadow.paper,
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
});
