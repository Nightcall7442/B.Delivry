/**
 * A line to write on: a capital above, a kraft wash with a dashed rule under it, the figures big and
 * tabular. The one text field of the stall app (price, stock, hours, a counter offer).
 */
import { noOutline, radius, scale } from '@bazar/mobile';
import { HALL, TONE, alpha } from '@bazar/storefront';
import { StyleSheet, Text as RNText, TextInput, View, type TextInputProps } from 'react-native';

import { capital, sceneFont } from '@/components/scene';

export function SlipInput({
  label,
  suffix,
  error,
  hint,
  ...input
}: Omit<TextInputProps, 'style'> & {
  label: string;
  /** The unit after the figures: «сум», «кг». */
  suffix?: string;
  error?: string | undefined;
  hint?: string;
}) {
  return (
    <View style={s.wrap}>
      <RNText style={s.label}>{label}</RNText>
      <View style={[s.field, error !== undefined && s.fieldError]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={TONE.inkSoft}
          style={s.input}
          {...input}
        />
        {suffix ? <RNText style={s.suffix}>{suffix}</RNText> : null}
      </View>
      {error !== undefined ? (
        <RNText style={s.error} accessibilityLiveRegion="polite">
          {error}
        </RNText>
      ) : hint ? (
        <RNText style={s.hint}>{hint}</RNText>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 4, flex: 1 },
  label: { ...capital, color: TONE.inkSoft },
  field: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: radius.paper,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: TONE.paperEdge,
    backgroundColor: alpha(TONE.kraft, 0.45),
  },
  fieldError: { borderColor: HALL.pomegranate },
  input: {
    flex: 1,
    paddingVertical: 0,
    fontSize: scale.title.fontSize,
    color: HALL.ink,
    fontFamily: sceneFont.heavy,
    fontVariant: ['tabular-nums'],
    ...noOutline,
  },
  suffix: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  hint: { fontFamily: sceneFont.ui, ...scale.caption, color: TONE.inkSoft },
});
