import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CircleButton from '../../../components/CircleButton';
import OfflineNotice from '../../../components/OfflineNotice';
import { DocsSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import { useAuth } from '../../../lib/AuthProvider';
import { confirm } from '../../../lib/confirm';
import {
  deleteDocument,
  fetchDocuments,
  formatSize,
  isPdf,
  keepOffline,
  kindInfo,
  openPdf,
  shareDocument,
  viewUri,
  type TravelDoc,
} from '../../../lib/documents';
import { peek } from '../../../lib/offline';
import { signedUrls } from '../../../lib/photos';
import { colors as c, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';
import { useTheme } from '../../../theme/useTheme';

// My documents: your private copies of passport, visa, insurance, QR codes
// and bookings. Only you can see them. They're all saved in the browser
// too, so they open at the border with no signal.

export default function Documents() {
  const insets = useSafeAreaInsets();
  const colors = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';

  const [docs, setDocs] = useState<TravelDoc[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedHere, setSavedHere] = useState<number | null>(null);
  const [viewing, setViewing] = useState<{ doc: TravelDoc; uri: string } | null>(null);

  const showThumbs = useCallback(async (list: TravelDoc[]) => {
    const paths = list.filter((d) => !isPdf(d)).map((d) => d.thumb_path ?? d.storage_path);
    if (!paths.length) return;
    try {
      const urls = await signedUrls('documents', paths);
      setThumbs((prev) => ({ ...prev, ...urls }));
    } catch {
      // offline with nothing saved: icons instead
    }
  }, []);

  const load = useCallback(() => {
    setError(null);
    peek<TravelDoc[]>('documents').then((saved) => {
      if (saved) {
        setDocs((cur) => (cur.length ? cur : saved));
        setLoading(false);
        showThumbs(saved);
      }
    });
    fetchDocuments()
      .then((list) => {
        setDocs(list);
        showThumbs(list);
        if (uid) keepOffline(list, uid).then(setSavedHere);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [showThumbs, uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function open(doc: TravelDoc) {
    setError(null);
    try {
      if (isPdf(doc)) await openPdf(doc);
      else setViewing({ doc, uri: await viewUri(doc) });
    } catch {
      setError('Couldn’t open that document. It needs a connection the first time.');
    }
  }

  async function remove(doc: TravelDoc) {
    const ok = await confirm('Delete this document?', `“${doc.label}” will be removed from your account and this phone.`);
    if (!ok) return;
    try {
      await deleteDocument(doc);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setViewing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SkyBackdrop />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.headerTitle, { color: colors.ink }]} accessibilityRole="header">
          My documents
        </Text>
        <CircleButton
          icon="add"
          label="Add a document"
          testID="documents-add-button"
          onPress={() => router.push('/(app)/arrivals/add-document')}
        />
      </View>
      <OfflineNotice />

      {loading ? (
        <DocsSkeleton />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {error ? <Text style={[type.body, { color: colors.error }]}>{error}</Text> : null}

          {docs.length === 0 && !error ? (
            <View style={[styles.empty, { backgroundColor: colors.card }]}>
              <Ionicons name="wallet-outline" size={34} color={colors.highlight} />
              <Text style={[type.cardTitle, { color: colors.ink }]}>Keep your travel papers here</Text>
              <Text style={[type.body, { color: colors.inkSecondary }]}>
                Passport, visas, insurance, Visit Japan Web QR codes, bookings: photos or PDFs. Only you can see them, and
                on your phone they open without a signal.
              </Text>
            </View>
          ) : null}

          {docs.map((doc) => {
            const info = kindInfo(doc.kind);
            const thumb = thumbs[doc.thumb_path ?? doc.storage_path];
            const meta = [info.label, isPdf(doc) ? 'PDF' : 'Photo', formatSize(doc.size_bytes)].filter(Boolean).join(' · ');
            return (
              <View key={doc.id} style={[styles.row, { backgroundColor: colors.card }]} testID="document-row">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${doc.label}. ${meta}`}
                  accessibilityHint={isPdf(doc) ? 'Opens the PDF' : 'Shows the photo full screen'}
                  onPress={() => open(doc)}
                  style={({ pressed }) => [styles.rowMain, { opacity: pressed ? 0.7 : 1 }]}
                >
                  {thumb && !isPdf(doc) ? (
                    <Image
                      source={{ uri: thumb, cacheKey: `documents:${doc.thumb_path ?? doc.storage_path}` }}
                      style={styles.thumb}
                      contentFit="cover"
                      accessibilityLabel=""
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbIcon, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons
                        name={(isPdf(doc) ? 'document-text-outline' : info.icon) as keyof typeof Ionicons.glyphMap}
                        size={26}
                        color={colors.highlight}
                      />
                    </View>
                  )}
                  <View style={styles.flex}>
                    <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={2}>
                      {doc.label}
                    </Text>
                    <Text style={[type.caption, { color: colors.inkSecondary }]}>{meta}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${doc.label}`}
                  onPress={() => remove(doc)}
                  style={styles.iconHit}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.inkTertiary} />
                </Pressable>
              </View>
            );
          })}

          {savedHere !== null && docs.length > 0 ? (
            <View style={styles.saved} testID="saved-on-phone">
              <Ionicons name="phone-portrait-outline" size={16} color={colors.inkSecondary} />
              <Text style={[type.caption, styles.flex, { color: colors.inkSecondary }]}>
                {savedHere === docs.length
                  ? 'All saved on this phone · they open offline'
                  : `${savedHere} of ${docs.length} saved on this phone · the rest save when you’re online`}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {viewing ? (
        <DocViewer
          doc={viewing.doc}
          uri={viewing.uri}
          onClose={() => setViewing(null)}
          onDelete={() => remove(viewing.doc)}
        />
      ) : null}
    </View>
  );
}

function DocViewer({ doc, uri, onClose, onDelete }: { doc: TravelDoc; uri: string; onClose: () => void; onDelete: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    // No fade: RN-web's Modal only unmounts after its CSS animationend.
    <Modal visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.viewer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]} testID="document-viewer">
        <View style={styles.viewerBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.viewerBtn}>
            <Ionicons name="close" size={24} color={c.onMedia} />
          </Pressable>
          <Text style={styles.viewerTitle} numberOfLines={1} accessibilityRole="header">
            {doc.label}
          </Text>
          <View style={styles.viewerBtn} />
        </View>
        {/* iOS pinch-zoom, so small print on a visa is readable. */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.viewerContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
        >
          <Image
            source={{ uri, cacheKey: `documents:${doc.storage_path}` }}
            style={styles.full}
            contentFit="contain"
            accessibilityLabel={doc.label}
          />
        </ScrollView>
        <View style={styles.viewerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => shareDocument(doc).catch(() => {})}
            style={({ pressed }) => [styles.viewerAction, pressed && { backgroundColor: c.mediaControlPressed }]}
          >
            <Ionicons name="share-outline" size={20} color={c.onMedia} />
            <Text style={styles.viewerActionText}>Share</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDelete}
            style={({ pressed }) => [styles.viewerAction, pressed && { backgroundColor: c.mediaControlPressed }]}
          >
            <Ionicons name="trash-outline" size={20} color={c.mediaDanger} />
            <Text style={[styles.viewerActionText, { color: c.mediaDanger }]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.2 },
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 12 },
  empty: { borderRadius: 22, padding: 20, gap: 8, alignItems: 'flex-start', boxShadow: shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingRight: 8, boxShadow: shadow.card },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12 },
  thumbIcon: { alignItems: 'center', justifyContent: 'center' },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, marginTop: 4 },
  viewer: { flex: 1, backgroundColor: c.mediaBackground },
  viewerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  viewerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  viewerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.bodySemiBold, fontSize: 17, color: c.onMedia },
  viewerContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '100%', minHeight: 300 },
  viewerActions: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingTop: 10 },
  viewerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: c.mediaControl,
  },
  viewerActionText: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, color: c.onMedia },
});
