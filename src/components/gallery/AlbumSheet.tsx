import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Album } from '../../lib/gallery';
import { colors as c, shadow } from '../../theme/colors';
import { fontFamily, type } from '../../theme/typography';

type Props = {
  visible: boolean;
  count: number;
  albums: Album[];
  onPick: (album: Album) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
  bottomInset: number;
};

// "Add to album" for the selected photos: an existing shared album, or a new
// one named here. A bottom sheet, like the chat's message actions.
export default function AlbumSheet({ visible, count, albums, onPick, onCreate, onClose, bottomInset }: Props) {
  const [name, setName] = useState('');
  const clean = name.trim().replace(/\s+/g, ' ');

  const close = () => {
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={styles.scrim} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 14) + 6 }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">
          Add {count} to an album
        </Text>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {albums.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              onPress={() => {
                setName('');
                onPick(a);
              }}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfacePressed : c.card }]}
            >
              <Ionicons name="albums-outline" size={20} color={c.highlight} />
              <Text style={[type.bodyStrong, styles.flex, { color: c.ink }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Text style={[type.caption, { color: c.inkSecondary }]}>{a.photoIds.length}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.newRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="New album name"
            placeholderTextColor={c.inkTertiary}
            maxLength={60}
            accessibilityLabel="New album name"
            style={styles.input}
            testID="album-name"
            onSubmitEditing={() => clean && onCreate(clean)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !clean }}
            disabled={!clean}
            onPress={() => {
              onCreate(clean);
              setName('');
            }}
            style={[styles.create, { backgroundColor: clean ? c.accent : c.accentDisabled }]}
          >
            <Text style={[type.bodyStrong, { color: c.onAccent }]}>Create</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: c.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
    boxShadow: shadow.float,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.handle },
  title: { fontFamily: fontFamily.display, fontSize: 20, color: c.ink, paddingHorizontal: 4 },
  list: { maxHeight: 280 },
  listContent: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    boxShadow: shadow.card,
  },
  newRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    ...type.body,
    flex: 1,
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: c.card,
    color: c.ink,
    boxShadow: shadow.card,
  },
  create: { height: 48, paddingHorizontal: 18, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
