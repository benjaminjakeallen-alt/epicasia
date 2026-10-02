import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import JournalEditor from '../../../components/journal/JournalEditor';
import JournalReader from '../../../components/journal/JournalReader';
import { JournalSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { draftFrom, fetchEntry, type JournalEntry } from '../../../lib/journal';
import { colors as c } from '../../../theme/colors';
import { type } from '../../../theme/typography';

// Your own entry opens in the editor; an entry someone shared opens to read.
export default function JournalEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<JournalEntry | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEntry(id)
      .then(setEntry)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this entry'));
  }, [id]);

  const draft = useMemo(() => (entry ? draftFrom(entry) : null), [entry]);

  if (!session) return null;
  if (entry && draft && entry.user_id === session.user.id) {
    return <JournalEditor initial={draft} previous={entry} userId={session.user.id} />;
  }
  if (entry) return <JournalReader entry={entry} />;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
      </View>
      {error || entry === null ? (
        <Text style={[type.body, styles.message, { color: c.inkSecondary }]}>
          {error ?? 'This entry is no longer available.'}
        </Text>
      ) : (
        <JournalSkeleton />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  message: { paddingHorizontal: 20 },
});
