import { createElement, useState, type CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';
import { useTheme } from '../../theme/useTheme';

type Props = {
  label: string;
  /** 'date' gives "YYYY-MM-DD", 'time' gives "HH:MM" (24 h) — what isValidDay / parseTimeInput read. */
  kind: 'date' | 'time';
  value: string;
  onChangeText: (value: string) => void;
  testID?: string;
};

/**
 * A date or a time, picked with the phone's own picker (the browser's
 * `<input type="date|time">` — the wheel on iPhone, a calendar elsewhere)
 * instead of typed as text. Looks like a FormField.
 */
export default function PickerField({ label, kind, value, onChangeText, testID }: Props) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);

  const input: CSSProperties = {
    // iPhone draws its own pill unless told not to, and centres the value.
    WebkitAppearance: 'none',
    appearance: 'none',
    boxSizing: 'border-box',
    display: 'block',
    width: '100%',
    height: 52,
    minWidth: 0,
    margin: 0,
    padding: '0 16px',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'solid',
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.ink,
    boxShadow: shadow.card,
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: '52px',
    textAlign: 'left',
    // The field in use wears the same sage ring as a FormField.
    outline: focused ? `2px solid ${colors.highlight}` : 'none',
  };

  return (
    <View style={styles.wrap}>
      <Text style={[type.caption, styles.label, { color: colors.inkSecondary }]}>{label}</Text>
      {createElement('input', {
        type: kind,
        value,
        'aria-label': label,
        'data-testid': testID,
        style: input,
        onChange: (e: { target: { value: string } }) => onChangeText(e.target.value),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  label: { marginBottom: 8 },
});
