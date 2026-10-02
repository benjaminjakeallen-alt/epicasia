import { Alert, Platform } from 'react-native';

/** A yes/no question (native alert; `window.confirm` on web, where Alert.alert does nothing). */
export function confirm(title: string, message: string, ok: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}
