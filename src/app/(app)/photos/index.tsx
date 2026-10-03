import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OfflineNotice from '../../../components/OfflineNotice';
import CircleButton from '../../../components/CircleButton';
import { GridSkeleton } from '../../../components/Skeleton';
import SkyBackdrop from '../../../components/SkyBackdrop';
import AlbumSheet from '../../../components/gallery/AlbumSheet';
import GalleryViewer from '../../../components/gallery/GalleryViewer';
import { useAuth } from '../../../lib/AuthProvider';
import { fetchMembers, type Member } from '../../../lib/chat';
import { dayLabel, firstName, personColor, sameDay } from '../../../lib/chatFormat';
import { confirm } from '../../../lib/confirm';
import {
  GALLERY_PAGE,
  addPhoto,
  addToAlbum,
  byTaken,
  cityOf,
  createAlbum,
  deleteAlbum,
  deletePhoto,
  fetchAlbums,
  fetchFavorites,
  fetchPhotos,
  removeFromAlbum,
  setFavorite,
  subscribeGallery,
  takenAt,
  updateCaption,
  type Album,
  type GalleryPhoto,
} from '../../../lib/gallery';
import {
  MAX_VIDEO_BYTES,
  durationLabel,
  savePhoto,
  shareFiles,
  signedUrls,
  type PhotoBucket,
  type PickedPhoto,
} from '../../../lib/photos';
import { STOPS } from '../../../lib/places';
import { colors as c, shadow } from '../../../theme/colors';
import { fontFamily, type } from '../../../theme/typography';

const COLS = 3;
const GAP = 3;
const PAD = 14;

type Filter = 'all' | 'favorites' | 'mine' | 'chat' | `person:${string}` | `city:${string}` | `album:${string}`;

/** A picked library/camera asset as an upload (photo or video). */
function toPicked(a: ImagePicker.ImagePickerAsset): PickedPhoto {
  const video = a.type === 'video' || !!a.mimeType?.startsWith('video/');
  return {
    uri: a.uri,
    width: a.width,
    height: a.height,
    mimeType: a.mimeType ?? (video ? 'video/mp4' : null),
    file: a.file ?? null,
    // The web picker gives seconds (Infinity for some recorded clips).
    durationMs: video ? (Number.isFinite(a.duration) ? Math.round((a.duration ?? 0) * 1000) : 0) : null,
  };
}

function tooBig(a: ImagePicker.ImagePickerAsset): boolean {
  const size = a.fileSize ?? a.file?.size ?? 0;
  return (a.type === 'video' || !!a.mimeType?.startsWith('video/')) && size > MAX_VIDEO_BYTES;
}

/** What a photo's file is for share/download: the video itself for a video. */
const fileOf = (p: GalleryPhoto) => ({ bucket: p.bucket, path: p.video_path ?? p.storage_path });
type Row = { key: string; photos: GalleryPhoto[] };
type Section = { key: string; title: string; count: number; data: Row[] };

export default function Photos() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const myId = session?.user.id ?? '';

  const [members, setMembers] = useState<Member[]>([]);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]); // newest first
  const [favs, setFavs] = useState<Record<string, string[]>>({}); // photo id -> user ids
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [upload, setUpload] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumSheet, setAlbumSheet] = useState(false);
  const loadingMore = useRef(false);

  const cell = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);

  const people = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    members.forEach((m, i) => map.set(m.id, { name: m.name, color: personColor(i) }));
    return map;
  }, [members]);
  const person = useCallback(
    (id: string) => people.get(id) ?? { name: 'Traveler', color: c.inkSecondary },
    [people],
  );

  // Signed URLs, grouped by bucket. `full` also fetches originals (viewer).
  const ensureUrls = useCallback(async (list: GalleryPhoto[], full = false) => {
    const byBucket: Record<PhotoBucket, string[]> = { chat: [], gallery: [], journal: [], avatars: [], documents: [], games: [] };
    for (const p of list) {
      byBucket[p.bucket].push(p.thumb_path ?? p.storage_path);
      if (full && p.thumb_path) byBucket[p.bucket].push(p.storage_path);
      if (full && p.video_path) byBucket[p.bucket].push(p.video_path);
    }
    try {
      const got = await Promise.all(
        (Object.keys(byBucket) as PhotoBucket[]).filter((b) => byBucket[b].length).map((b) => signedUrls(b, byBucket[b])),
      );
      // Only re-render when something new arrived (the viewer asks often).
      setUrls((prev) => {
        const merged: Record<string, string> = Object.assign({}, ...got);
        const fresh = Object.keys(merged).some((k) => prev[k] !== merged[k]);
        return fresh ? { ...prev, ...merged } : prev;
      });
    } catch {
      // Missing URLs just leave placeholders; the next load retries.
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [m, list, f] = await Promise.all([fetchMembers(), fetchPhotos(), fetchFavorites()]);
        if (!alive) return;
        setMembers(m);
        setPhotos([...list].sort(byTaken));
        setHasMore(list.length === GALLERY_PAGE);
        const byPhoto: Record<string, string[]> = {};
        for (const x of f) (byPhoto[x.photo_id] ??= []).push(x.user_id);
        setFavs(byPhoto);
        ensureUrls(list);
        fetchAlbums()
          .then((a) => alive && setAlbums(a))
          .catch(() => {});
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load photos');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ensureUrls]);

  // Live: new uploads (and chat photos) appear for everyone.
  useEffect(
    () =>
      subscribeGallery({
        onUpsert: (p) => {
          setPhotos((prev) => {
            const i = prev.findIndex((x) => x.id === p.id);
            if (i >= 0) {
              const next = prev.slice();
              next[i] = p;
              return next;
            }
            return [p, ...prev].sort(byTaken);
          });
          ensureUrls([p]);
        },
        onRemove: (id) => setPhotos((prev) => prev.filter((x) => x.id !== id)),
        onFavorite: (f, on) =>
          setFavs((prev) => {
            const cur = prev[f.photo_id] ?? [];
            const next = on ? (cur.includes(f.user_id) ? cur : [...cur, f.user_id]) : cur.filter((u) => u !== f.user_id);
            return { ...prev, [f.photo_id]: next };
          }),
      }),
    [ensureUrls],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore.current || photos.length === 0) return;
    loadingMore.current = true;
    try {
      const older = await fetchPhotos(takenAt(photos[photos.length - 1]));
      setPhotos((prev) => [...prev, ...older.filter((o) => !prev.some((p) => p.id === o.id))]);
      setHasMore(older.length === GALLERY_PAGE);
      ensureUrls(older);
    } finally {
      loadingMore.current = false;
    }
  }, [hasMore, photos, ensureUrls]);

  // ---- filtering & sections ------------------------------------------------

  const visible = useMemo(() => {
    return photos.filter((p) => {
      if (filter === 'favorites') return (favs[p.id] ?? []).includes(myId);
      if (filter === 'mine') return p.user_id === myId;
      if (filter === 'chat') return p.bucket === 'chat';
      if (filter.startsWith('person:')) return p.user_id === filter.slice(7);
      if (filter.startsWith('city:')) return cityOf(p)?.key === filter.slice(5);
      if (filter.startsWith('album:')) return albums.find((a) => a.id === filter.slice(6))?.photoIds.includes(p.id) ?? false;
      return true;
    });
  }, [photos, filter, favs, myId, albums]);

  const activeAlbum = filter.startsWith('album:') ? (albums.find((a) => a.id === filter.slice(6)) ?? null) : null;

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    for (const p of visible) {
      let s = out[out.length - 1];
      if (!s || !sameDay(s.key, takenAt(p))) {
        s = { key: takenAt(p), title: dayLabel(takenAt(p)), count: 0, data: [] };
        out.push(s);
      }
      s.count += 1;
      const row = s.data[s.data.length - 1];
      if (row && row.photos.length < COLS) row.photos.push(p);
      else s.data.push({ key: p.id, photos: [p] });
    }
    return out;
  }, [visible]);

  const uploaders = useMemo(() => {
    const ids = new Set(photos.map((p) => p.user_id));
    return members.filter((m) => ids.has(m.id));
  }, [photos, members]);

  // ---- actions ---------------------------------------------------------------

  const uploadAll = useCallback(
    async (picked: PickedPhoto[]) => {
      if (!picked.length) return;
      setNotice(null);
      setUpload({ done: 0, total: picked.length, failed: 0 });
      let failed = 0;
      // Two at a time: quick on good Wi-Fi, gentle on hotel/roaming data.
      const queue = picked.slice();
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          try {
            const saved = await addPhoto(myId, next);
            setPhotos((prev) => (prev.some((x) => x.id === saved.id) ? prev : [saved, ...prev].sort(byTaken)));
            ensureUrls([saved]);
          } catch {
            failed += 1;
          }
          setUpload((u) => (u ? { ...u, done: u.done + 1, failed } : u));
        }
      };
      await Promise.all([worker(), worker()]);
      setUpload(null);
      setNotice(
        failed
          ? `${picked.length - failed} uploaded · ${failed} couldn’t upload — check your connection and try again.`
          : `${picked.length} added`,
      );
    },
    [myId, ensureUrls],
  );

  const uploadPicked = useCallback(
    (res: ImagePicker.ImagePickerResult) => {
      if (res.canceled) return;
      const ok = res.assets.filter((a) => !tooBig(a));
      const skipped = res.assets.length - ok.length;
      uploadAll(ok.map(toPicked)).then(() => {
        if (skipped) setNotice(`${skipped} video${skipped === 1 ? ' is' : 's are'} over 50 MB — trim and try again.`);
      });
    },
    [uploadAll],
  );

  const pickFromLibrary = useCallback(async () => {
    uploadPicked(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 30,
        orderedSelection: true,
        quality: 0.92,
      }),
    );
  }, [uploadPicked]);

  const takePhoto = useCallback(async () => {
    uploadPicked(await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.92 }));
  }, [uploadPicked]);

  const toggleFav = useCallback(
    async (p: GalleryPhoto) => {
      const on = !(favs[p.id] ?? []).includes(myId);
      const apply = (value: boolean) =>
        setFavs((prev) => {
          const cur = prev[p.id] ?? [];
          return { ...prev, [p.id]: value ? [...cur.filter((u) => u !== myId), myId] : cur.filter((u) => u !== myId) };
        });
      apply(on);
      try {
        await setFavorite(p.id, myId, on);
      } catch {
        apply(!on);
      }
    },
    [favs, myId],
  );

  const removePhoto = useCallback(async (p: GalleryPhoto) => {
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    setViewerIndex(null);
    try {
      await deletePhoto(p);
    } catch {
      setPhotos((prev) => [p, ...prev].sort(byTaken));
      setNotice('Couldn’t delete that photo. Try again.');
    }
  }, []);

  const saveOne = useCallback(async (p: GalleryPhoto) => {
    try {
      const f = fileOf(p);
      await savePhoto(f.bucket, f.path);
      return 'Downloading…';
    } catch {
      return 'Couldn’t download that. Try again.';
    }
  }, []);

  const saveSelected = useCallback(async () => {
    if (!selected) return;
    const list = photos.filter((p) => selected.has(p.id));
    setNotice(`Downloading ${list.length}…`);
    let ok = 0;
    for (const p of list) {
      try {
        const f = fileOf(p);
        if (await savePhoto(f.bucket, f.path)) ok += 1;
      } catch {
        // counted below
      }
    }
    setSelected(null);
    setNotice(ok === list.length ? `Downloading ${ok}` : `Downloading ${ok} of ${list.length} — the rest couldn’t be fetched`);
  }, [selected, photos]);

  const shareSelected = useCallback(async () => {
    if (!selected) return;
    const list = photos.filter((p) => selected.has(p.id));
    try {
      const res = await shareFiles(list.map(fileOf));
      if (res !== 'cancelled') setSelected(null);
      if (res === 'downloaded') setNotice(`This browser can’t share files — downloading ${list.length} instead.`);
    } catch {
      setNotice('Couldn’t share those. Try again.');
    }
  }, [selected, photos]);

  // ---- albums ----------------------------------------------------------------

  const addSelectedTo = useCallback(
    async (album: Album | null, name?: string) => {
      if (!selected) return;
      const ids = [...selected];
      setAlbumSheet(false);
      setSelected(null);
      try {
        if (album) {
          await addToAlbum(album.id, myId, ids);
          setAlbums((prev) =>
            prev.map((a) => (a.id === album.id ? { ...a, photoIds: [...new Set([...a.photoIds, ...ids])] } : a)),
          );
          setNotice(`Added ${ids.length} to ${album.name}`);
        } else if (name) {
          const made = await createAlbum(name, myId, ids);
          setAlbums((prev) => [...prev, made]);
          setFilter(`album:${made.id}`);
          setNotice(`Made “${made.name}” with ${ids.length}`);
        }
      } catch {
        setNotice('Couldn’t update the album. Try again.');
      }
    },
    [selected, myId],
  );

  const removeSelectedFromAlbum = useCallback(async () => {
    if (!selected || !activeAlbum) return;
    const ids = [...selected];
    setSelected(null);
    setAlbums((prev) =>
      prev.map((a) => (a.id === activeAlbum.id ? { ...a, photoIds: a.photoIds.filter((x) => !ids.includes(x)) } : a)),
    );
    try {
      await removeFromAlbum(activeAlbum.id, ids);
    } catch {
      setAlbums((prev) => prev.map((a) => (a.id === activeAlbum.id ? activeAlbum : a)));
      setNotice('Couldn’t update the album. Try again.');
    }
  }, [selected, activeAlbum]);

  const removeAlbum = useCallback(
    async (album: Album) => {
      if (album.created_by !== myId) return;
      if (!(await confirm(`Delete “${album.name}”?`, 'The photos stay in the gallery.', 'Delete album', true))) return;
      try {
        await deleteAlbum(album.id);
        setAlbums((prev) => prev.filter((a) => a.id !== album.id));
        setFilter('all');
      } catch {
        setNotice('Couldn’t delete that album. Try again.');
      }
    },
    [myId],
  );

  // Stable, so the viewer's "fetch originals" effect doesn't re-run on
  // every render.
  const needFullUrls = useCallback((list: GalleryPhoto[]) => ensureUrls(list, true), [ensureUrls]);

  const selectedList = useMemo(() => (selected ? photos.filter((p) => selected.has(p.id)) : []), [selected, photos]);
  const canDeleteSelected =
    selectedList.length > 0 && selectedList.every((p) => p.user_id === myId && p.bucket === 'gallery');

  const deleteSelected = useCallback(async () => {
    const list = selectedList;
    setSelected(null);
    for (const p of list) await removePhoto(p);
  }, [selectedList, removePhoto]);

  // ---- render ----------------------------------------------------------------

  const fromChat = photos.filter((p) => p.bucket === 'chat').length;
  const cities = new Set(photos.map((p) => cityOf(p)?.key).filter(Boolean));
  const chips: { key: Filter; label: string; color?: string; icon?: keyof typeof Ionicons.glyphMap; album?: Album }[] = [
    { key: 'all', label: 'All' },
    { key: 'favorites', label: 'Favorites', icon: 'heart' },
    ...STOPS.filter((st) => cities.has(st.key)).map((st) => ({
      key: `city:${st.key}` as Filter,
      label: st.city,
      icon: 'location-outline' as const,
    })),
    ...albums.map((a) => ({ key: `album:${a.id}` as Filter, label: a.name, icon: 'albums-outline' as const, album: a })),
    { key: 'mine', label: 'Mine' },
    ...(fromChat ? [{ key: 'chat' as Filter, label: 'From chat', icon: 'chatbubble-outline' as const }] : []),
    ...uploaders
      .filter((m) => m.id !== myId)
      .map((m) => ({ key: `person:${m.id}` as Filter, label: firstName(m.name), color: person(m.id).color })),
  ];

  const openPhoto = (p: GalleryPhoto) => {
    if (selected) {
      const next = new Set(selected);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      setSelected(next.size ? next : null);
      return;
    }
    setViewerIndex(visible.findIndex((x) => x.id === p.id));
  };

  const renderRow = ({ item }: { item: Row }) => (
    <View style={styles.row}>
      {item.photos.map((p) => {
        const src = urls[p.thumb_path ?? p.storage_path];
        const isSel = selected?.has(p.id) ?? false;
        const favCount = (favs[p.id] ?? []).length;
        return (
          <Pressable
            accessibilityRole="button"
            key={p.id}
            onPress={() => openPhoto(p)}
            onLongPress={() => setSelected(new Set([...(selected ?? []), p.id]))}
            delayLongPress={300}
            accessibilityLabel={`${p.video_path ? `Video, ${durationLabel(p.video_duration_ms)},` : 'Photo'} by ${
              p.user_id === myId ? 'you' : person(p.user_id).name
            }${p.caption ? `: ${p.caption}` : ''}`}
            accessibilityHint={selected ? 'Tap to select' : 'Opens the photo. Long press to select several'}
            accessibilityState={{ selected: isSel }}
            testID="gallery-cell"
            style={({ pressed }) => [styles.cell, { width: cell, height: cell, opacity: pressed ? 0.85 : 1 }]}
          >
            {src ? (
              <Image
                source={{ uri: src, cacheKey: `${p.bucket}:${p.thumb_path ?? p.storage_path}` }}
                recyclingKey={p.id}
                contentFit="cover"
                transition={160}
                accessibilityLabel=""
                style={{ width: cell, height: cell }}
              />
            ) : (
              <View style={[styles.placeholder, { width: cell, height: cell }]} />
            )}
            {favCount > 0 ? (
              <View style={styles.badgeFav}>
                <Ionicons name="heart" size={11} color={c.onMedia} />
                {favCount > 1 ? <Text style={styles.badgeText}>{favCount}</Text> : null}
              </View>
            ) : null}
            {p.video_path ? (
              <View style={styles.badgeVideo}>
                <Ionicons name="play" size={10} color={c.onMedia} />
                {p.video_duration_ms ? <Text style={styles.badgeText}>{durationLabel(p.video_duration_ms)}</Text> : null}
              </View>
            ) : null}
            {p.bucket === 'chat' ? (
              <View style={styles.badgeChat}>
                <Ionicons name="chatbubble" size={10} color={c.onMedia} />
              </View>
            ) : null}
            {selected ? (
              <View style={[styles.check, isSel && styles.checkOn]}>
                {isSel ? <Ionicons name="checkmark" size={15} color={c.onAccent} /> : null}
              </View>
            ) : null}
            {isSel ? <View style={styles.selShade} /> : null}
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SkyBackdrop height={280} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {selected ? (
          <>
            <Pressable onPress={() => setSelected(null)} style={styles.textBtn} accessibilityRole="button">
              <Text style={[type.bodyStrong, { color: c.highlight }]}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>{selected.size} selected</Text>
            <View style={styles.textBtn} />
          </>
        ) : (
          <>
            <CircleButton icon="chevron-back" label="Back" onPress={() => router.back()} />
            <View style={styles.headerText}>
              <Text style={styles.title} accessibilityRole="header">
                Photos
              </Text>
            </View>
            <CircleButton icon="camera-outline" label="Take a photo or video" onPress={takePhoto} />
            <CircleButton icon="add" label="Add photos and videos" onPress={pickFromLibrary} testID="gallery-add" />
          </>
        )}
      </View>
      <OfflineNotice />

      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsBar}>
          {chips.map((ch) => {
            const on = filter === ch.key;
            return (
              <Pressable
                key={ch.key}
                onPress={() => setFilter(ch.key)}
                onLongPress={ch.album && ch.album.created_by === myId ? () => removeAlbum(ch.album!) : undefined}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityHint={ch.album && ch.album.created_by === myId ? 'Long press to delete the album' : undefined}
                testID={`chip-${ch.key}`}
                style={[styles.chip, on ? { backgroundColor: c.accent } : { backgroundColor: c.card }]}
              >
                {ch.color ? <View style={[styles.chipDot, { backgroundColor: ch.color }]} /> : null}
                {ch.icon ? <Ionicons name={ch.icon} size={13} color={on ? c.onAccent : ch.key === 'favorites' ? c.favorite : c.inkSecondary} /> : null}
                <Text style={[styles.chipText, { color: on ? c.onAccent : c.ink }]}>{ch.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {upload ? (
        <View style={styles.progressCard} accessibilityLiveRegion="polite">
          <Text style={[type.bodyStrong, { color: c.ink }]}>
            Uploading {Math.min(upload.done + 1, upload.total)} of {upload.total}…
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(upload.done / upload.total) * 100}%` }]} />
          </View>
        </View>
      ) : null}

      {notice ? (
        <Pressable onPress={() => setNotice(null)} style={styles.notice} accessibilityRole="alert">
          <Text style={[type.caption, { color: c.ink, flex: 1 }]}>{notice}</Text>
          <Ionicons name="close" size={14} color={c.inkTertiary} />
        </Pressable>
      ) : null}

      {loading ? (
        <GridSkeleton cell={cell} gap={GAP} pad={PAD} />
      ) : error ? (
        <Text style={[type.body, styles.message, { color: c.error }]}>{error}</Text>
      ) : photos.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>📸</Text>
            <Text style={styles.emptyTitle}>The trip album starts here</Text>
            <Text style={[type.body, styles.emptyBody]}>
              Add your favourite shots — and any photo shared in the group chat lands here automatically.
            </Text>
            <Pressable onPress={pickFromLibrary} style={styles.emptyBtn} accessibilityRole="button">
              <Ionicons name="images-outline" size={18} color={c.onAccent} />
              <Text style={styles.emptyBtnText}>Add photos</Text>
            </Pressable>
          </View>
        </View>
      ) : visible.length === 0 ? (
        <Text style={[type.body, styles.message, { color: c.inkSecondary }]}>
          {filter === 'favorites'
            ? 'Tap ♥ on a photo to keep it here.'
            : activeAlbum
              ? 'Long press photos to select them, then Album to add them here.'
              : 'No photos here yet.'}
        </Text>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHead, { backgroundColor: c.background }]}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {section.title}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: insets.bottom + (selected ? 96 : 32) }}
          testID="gallery-grid"
        />
      )}

      {selected ? (
        <View style={[styles.selectBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={shareSelected} style={styles.selectBtn} accessibilityRole="button" testID="select-share">
            <Ionicons name="share-outline" size={21} color={c.highlight} />
            <Text style={[styles.selectText, { color: c.highlight }]}>Share</Text>
          </Pressable>
          <Pressable onPress={saveSelected} style={styles.selectBtn} accessibilityRole="button">
            <Ionicons name="download-outline" size={21} color={c.highlight} />
            <Text style={[styles.selectText, { color: c.highlight }]}>Download</Text>
          </Pressable>
          <Pressable onPress={() => setAlbumSheet(true)} style={styles.selectBtn} accessibilityRole="button" testID="select-album">
            <Ionicons name="albums-outline" size={21} color={c.highlight} />
            <Text style={[styles.selectText, { color: c.highlight }]}>Album</Text>
          </Pressable>
          {activeAlbum ? (
            <Pressable onPress={removeSelectedFromAlbum} style={styles.selectBtn} accessibilityRole="button" accessibilityLabel="Remove from album">
              <Ionicons name="remove-circle-outline" size={21} color={c.highlight} />
              <Text style={[styles.selectText, { color: c.highlight }]}>Remove</Text>
            </Pressable>
          ) : null}
          {canDeleteSelected ? (
            <Pressable onPress={deleteSelected} style={styles.selectBtn} accessibilityRole="button">
              <Ionicons name="trash-outline" size={21} color={c.danger} />
              <Text style={[styles.selectText, { color: c.danger }]}>Delete</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <GalleryViewer
        photos={visible}
        startIndex={viewerIndex}
        urls={urls}
        myId={myId}
        person={person}
        favCount={(id) => (favs[id] ?? []).length}
        isFav={(id) => (favs[id] ?? []).includes(myId)}
        onToggleFav={toggleFav}
        onSave={saveOne}
        onShare={(p) => {
          shareFiles([fileOf(p)]).catch(() => {});
        }}
        onDelete={removePhoto}
        onCaption={(p, text) => {
          setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, caption: text.trim() || null } : x)));
          updateCaption(p.id, text).catch(() => setNotice('Couldn’t save the caption.'));
        }}
        onNeedUrls={needFullUrls}
        onClose={() => setViewerIndex(null)}
      />

      <AlbumSheet
        visible={albumSheet}
        count={selected?.size ?? 0}
        albums={albums}
        onPick={(a) => addSelectedTo(a)}
        onCreate={(name) => addSelectedTo(null, name)}
        onClose={() => setAlbumSheet(false)}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: c.ink,
  },
  textBtn: {
    minWidth: 64,
    height: 44,
    justifyContent: 'center',
  },
  chipsBar: {
    flexGrow: 0,
  },
  chips: {
    paddingHorizontal: PAD,
    paddingBottom: 10,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    boxShadow: shadow.card,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 13.5,
  },
  progressCard: {
    marginHorizontal: PAD,
    marginBottom: 10,
    padding: 14,
    gap: 10,
    borderRadius: 18,
    backgroundColor: c.card,
    boxShadow: shadow.card,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: c.accentSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: c.accent,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: PAD,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: c.card,
    boxShadow: shadow.card,
  },
  message: {
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 30,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    color: c.ink,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: GAP,
  },
  cell: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: c.skeleton,
  },
  placeholder: {
    backgroundColor: c.skeleton,
  },
  badgeFav: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: c.mediaBadge,
  },
  badgeText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 10.5,
    color: c.onMedia,
  },
  badgeVideo: {
    position: 'absolute',
    left: 5,
    top: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: c.mediaBadge,
  },
  badgeChat: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.mediaBadge,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.onMedia,
    backgroundColor: c.mediaBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  selShade: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3,
    borderColor: c.accent,
    borderRadius: 6,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyCard: {
    backgroundColor: c.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    boxShadow: shadow.card,
  },
  emptyEmoji: {
    fontSize: 34,
  },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    color: c.ink,
    textAlign: 'center',
  },
  emptyBody: {
    color: c.inkSecondary,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 25,
    backgroundColor: c.accent,
  },
  emptyBtnText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 16,
    color: c.onAccent,
  },
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    backgroundColor: c.card,
    boxShadow: shadow.float,
  },
  selectBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 48,
    minWidth: 60,
    paddingHorizontal: 6,
  },
  selectText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12,
  },
});
