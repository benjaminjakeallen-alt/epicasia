import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { savedLabel, useOfflineSince } from '../lib/offline';
import { colors as c } from '../theme/colors';
import { fontFamily } from '../theme/typography';

// Shown on a screen while it's displaying a saved copy because the
// network didn't answer. Nothing at all while online.
export default function OfflineNotice() {
  const since = useOfflineSince();
  if (since === null) return null;
  return (
    <View style={[styles.wrap, { backgroundColor: c.warningSoft }]} accessibilityRole="alert" testID="offline-notice">
      <Ionicons name="cloud-offline-outline" size={18} color={c.warning} />
      <Text style={[styles.text, { color: c.ink }]}>Offline · showing what was saved {savedLabel(since)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  text: {
    flex: 1,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
  },
});
