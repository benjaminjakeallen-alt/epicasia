import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import FormButton from '../../../components/form/FormButton';
import FormField from '../../../components/form/FormField';
import FormScreen from '../../../components/form/FormScreen';
import { useAuth } from '../../../lib/AuthProvider';
import { addDocument, DOC_KINDS, formatSize, kindInfo, MAX_BYTES, type DocKind, type PickedFile } from '../../../lib/documents';
import { shadow } from '../../../theme/colors';
import { type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// Add a document to My documents: what it is, a name, then a photo (library
// or camera) or a PDF/file from Files.

export default function AddDocument() {
  const router = useRouter();
  const colors = useTheme();
  const { session } = useAuth();
  const [kind, setKind] = useState<DocKind>('passport');
  const [label, setLabel] = useState('Passport');
  const [labelEdited, setLabelEdited] = useState(false);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function chooseKind(k: DocKind) {
    setKind(k);
    if (!labelEdited) setLabel(kindInfo(k).label);
  }

  async function pickPhoto(fromCamera: boolean) {
    setError(null);
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError('Camera access is off. Turn it on for Epic Asia in Settings to take a photo.');
        return;
      }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const mime = a.mimeType && a.mimeType.startsWith('image/') ? a.mimeType : 'image/jpeg';
    setFile({ uri: a.uri, name: a.fileName ?? null, mime, size: a.fileSize ?? null, width: a.width, height: a.height });
  }

  async function pickFile() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    const mime = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    setFile({ uri: a.uri, name: a.name, mime, size: a.size ?? null });
  }

  async function save() {
    setError(null);
    if (!session) return setError('You must be signed in.');
    if (!file) return setError('Choose a photo or a PDF first.');
    if (!label.trim()) return setError('Give it a name.');
    if (file.size && file.size > MAX_BYTES) return setError('That file is over 20 MB.');
    setSaving(true);
    try {
      await addDocument(session.user.id, file, kind, label);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save it');
    } finally {
      setSaving(false);
    }
  }

  const isImage = file?.mime.startsWith('image/');

  return (
    <FormScreen title="Add a document" error={error}>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="What is it?">
        {DOC_KINDS.map((k) => {
          const on = k.kind === kind;
          return (
            <Pressable
              key={k.kind}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => chooseKind(k.kind)}
              style={[
                styles.chip,
                { backgroundColor: on ? colors.accent : colors.card, borderColor: on ? colors.accent : colors.border },
              ]}
            >
              <Ionicons
                name={k.icon as keyof typeof Ionicons.glyphMap}
                size={16}
                color={on ? colors.onAccent : colors.inkSecondary}
              />
              <Text style={[type.bodyStrong, { color: on ? colors.onAccent : colors.ink }]}>{k.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <FormField
        label="Name"
        value={label}
        onChangeText={(t) => {
          setLabel(t);
          setLabelEdited(true);
        }}
        placeholder="Passport"
        autoCapitalize="sentences"
        maxLength={80}
      />

      {file ? (
        <View style={[styles.picked, { backgroundColor: colors.card }]} testID="picked-file">
          {isImage ? (
            <Image source={{ uri: file.uri }} style={styles.preview} contentFit="cover" accessibilityLabel="" />
          ) : (
            <View style={[styles.preview, styles.pdf, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="document-outline" size={26} color={colors.highlight} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={1}>
              {file.name ?? (isImage ? 'Photo' : 'PDF')}
            </Text>
            <Text style={[type.caption, { color: colors.inkSecondary }]}>
              {[isImage ? 'Photo' : 'PDF', formatSize(file.size)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove the chosen file"
            onPress={() => setFile(null)}
            style={styles.iconHit}
          >
            <Ionicons name="close" size={20} color={colors.inkSecondary} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.sources}>
          <Source icon="images-outline" label="Photo" onPress={() => pickPhoto(false)} />
          {Platform.OS !== 'web' ? <Source icon="camera-outline" label="Camera" onPress={() => pickPhoto(true)} /> : null}
          <Source icon="document-attach-outline" label="PDF or file" onPress={pickFile} testID="pick-file" />
        </View>
      )}

      <FormButton label="Save" onPress={save} loading={saving} disabled={!file} />
      <FormButton label="Cancel" variant="text" onPress={() => router.back()} />
    </FormScreen>
  );
}

function Source({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Choose a ${label.toLowerCase()}`}
      onPress={onPress}
      style={({ pressed }) => [styles.source, { backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name={icon} size={24} color={colors.highlight} />
      <Text style={[type.bodyStrong, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  sources: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  source: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 84,
    borderRadius: 18,
    boxShadow: shadow.card,
  },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    marginVertical: 8,
    boxShadow: shadow.card,
  },
  preview: { width: 56, height: 56, borderRadius: 12 },
  pdf: { alignItems: 'center', justifyContent: 'center' },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
