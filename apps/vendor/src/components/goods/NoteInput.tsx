/**
 * A line of words to write on — a reason, a note about a customer: the slip's kraft wash and dashed
 * rule, in body type, three lines tall and growing. `SlipInput` is for figures: one line, big and
 * tabular, where a sentence was cut at both ends.
 */
import { noOutline, radius, scale } from '@bazar/mobile';
import { HALL, TONE, alpha } from '@bazar/storefront';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { sceneFont } from '@/components/scene';

export function NoteInput(props: Omit<TextInputProps, 'style' | 'multiline'>) {
  return (
    <TextInput
      placeholderTextColor={alpha(TONE.inkSoft, 0.55)}
      {...props}
      multiline
      style={s.input}
    />
  );
}

const s = StyleSheet.create({
  input: {
    minHeight: 96,
    borderRadius: radius.paper,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: TONE.paperEdge,
    backgroundColor: alpha(TONE.kraft, 0.45),
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontFamily: sceneFont.ui,
    ...scale.lead,
    color: HALL.ink,
    ...noOutline,
  },
});
