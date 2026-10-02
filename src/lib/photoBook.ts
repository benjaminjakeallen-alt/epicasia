import qrcode from 'qrcode-generator';
import { Platform } from 'react-native';
import { GLYPH } from '../components/Seal';
import { colors as c, legColors, legTextColors } from '../theme/colors';
import { formatMonthDay, parseDay } from './dates';
import { formatDuration, type JournalEntry, type JournalMedia } from './journal';
import { STOPS, stopForDay, type Stop } from './places';
import { supabase } from './supabase';
import { TRIP } from './trip';

// The end-of-trip photo book: a printable 8×8 in PDF made on the phone from
// your own journal — a cover, a divider page per leg, then each entry with
// its text, photos and voice notes. A voice note prints as a QR code that
// plays it (a long-lived signed link to that one file), plus its length
// and caption. On web the book opens in a new tab to print / save as PDF.

const PAGE = 576; // 8 in at 72 pt/in
const PHOTO_MAX = 1400; // px on the long side — sharp in print, small enough to embed
const QR_LINK_SECONDS = 10 * 365 * 24 * 60 * 60; // the book should keep working for years

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type BookProgress = (step: string) => void;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function longDay(day: string): string {
  const d = parseDay(day);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function legKey(stop: Stop | null) {
  return stop?.key as keyof typeof legColors | undefined;
}

/** A photo as a data: URI, downsized for print. */
async function photoData(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('journal').createSignedUrl(path, 600);
  if (error || !data) return null;
  try {
    if (Platform.OS === 'web') {
      const blob = await (await fetch(data.signedUrl)).blob();
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
    const [{ File, Paths }, { ImageManipulator, SaveFormat }] = await Promise.all([
      import('expo-file-system'),
      import('expo-image-manipulator'),
    ]);
    const dest = new File(Paths.cache, `book-${path.replace(/\//g, '_')}`);
    if (dest.exists) dest.delete();
    const file = await File.downloadFileAsync(data.signedUrl, dest);
    const ctx = ImageManipulator.manipulate(file.uri);
    ctx.resize({ width: PHOTO_MAX });
    const out = await (await ctx.renderAsync()).saveAsync({ base64: true, compress: 0.82, format: SaveFormat.JPEG });
    file.delete();
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}

async function voiceQr(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('journal').createSignedUrl(path, QR_LINK_SECONDS);
  if (error || !data) return null;
  const qr = qrcode(0, 'M');
  qr.addData(data.signedUrl);
  qr.make();
  return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

function seal(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" style="transform:rotate(-4deg)">
    <rect x="2" y="2" width="116" height="116" rx="12" fill="${c.seal}"/>
    <rect x="9" y="9" width="102" height="102" rx="7" fill="none" stroke="${c.onAccent}" stroke-width="2.5"/>
    <g transform="translate(19 19) scale(0.82)"><path d="${GLYPH}" fill="${c.onAccent}"/></g>
  </svg>`;
}

function photosHtml(photos: JournalMedia[], data: Record<string, string>): string {
  const shown = photos.filter((p) => data[p.id]);
  if (!shown.length) return '';
  const cls = shown.length === 1 ? 'one' : 'grid';
  return `<div class="photos ${cls}">${shown
    .map(
      (p) =>
        `<figure><img src="${data[p.id]}" alt="">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`,
    )
    .join('')}</div>`;
}

function voiceHtml(notes: JournalMedia[], qrs: Record<string, string>): string {
  return notes
    .map(
      (n, i) => `<div class="voice">
        <div class="qr">${qrs[n.id] ?? ''}</div>
        <div>
          <div class="voice-title">Voice note${notes.length > 1 ? ` ${i + 1}` : ''} · ${formatDuration(n.duration_ms)}</div>
          ${n.caption ? `<div class="voice-caption">${esc(n.caption)}</div>` : ''}
          ${qrs[n.id] ? '<div class="voice-hint">Scan with a phone camera to listen</div>' : ''}
        </div>
      </div>`,
    )
    .join('');
}

export async function buildPhotoBookHtml(entries: JournalEntry[], author: string, progress: BookProgress): Promise<string> {
  const ordered = [...entries].sort((a, b) => (a.day === b.day ? a.created_at.localeCompare(b.created_at) : a.day.localeCompare(b.day)));
  const photos = ordered.flatMap((e) => e.journal_media.filter((m) => m.kind === 'photo'));
  const notes = ordered.flatMap((e) => e.journal_media.filter((m) => m.kind === 'audio'));

  const data: Record<string, string> = {};
  let n = 0;
  for (const p of photos) {
    progress(`Preparing photo ${++n} of ${photos.length}…`);
    const uri = await photoData(p.storage_path);
    if (uri) data[p.id] = uri;
  }
  const qrs: Record<string, string> = {};
  n = 0;
  for (const v of notes) {
    progress(`Linking voice note ${++n} of ${notes.length}…`);
    const svg = await voiceQr(v.storage_path);
    if (svg) qrs[v.id] = svg;
  }
  progress('Laying out pages…');

  const cover = photos.find((p) => data[p.id]);
  const pages: string[] = [];

  pages.push(`<section class="cover">
    ${cover ? `<div class="cover-photo"><img src="${data[cover.id]}" alt=""></div>` : ''}
    <div class="cover-text">
      <div class="brand">Epic <em>Asia</em> ${seal(30)}</div>
      <div class="cover-sub">A trip journal by ${esc(author)}</div>
      <div class="cover-meta">${esc(TRIP.dates)} · ${STOPS.map((s) => esc(s.city)).join(' · ')}</div>
    </div>
  </section>`);

  let currentLeg: string | null | undefined;
  for (const e of ordered) {
    const stop = stopForDay(e.day);
    const key = legKey(stop);
    if (stop && stop.key !== currentLeg) {
      pages.push(`<section class="leg">
        <div class="leg-rule" style="background:${legColors[key!]}"></div>
        <div class="leg-city">${esc(stop.city)}</div>
        <div class="leg-meta" style="color:${legTextColors[key!]}">${esc(stop.country)} · ${esc(stop.dates)}</div>
      </section>`);
    }
    currentLeg = stop?.key ?? null;
    const where = e.city ?? stop?.city;
    const media = e.journal_media;
    pages.push(`<section class="entry">
      <div class="kicker" style="color:${key ? legTextColors[key] : c.inkSecondary}">${esc(longDay(e.day))}${where ? ` · ${esc(where)}` : ''}</div>
      ${e.title ? `<h2>${esc(e.title)}</h2>` : ''}
      ${e.body ? `<div class="body">${paragraphs(e.body)}</div>` : ''}
      ${photosHtml(media.filter((m) => m.kind === 'photo'), data)}
      ${voiceHtml(media.filter((m) => m.kind === 'audio'), qrs)}
    </section>`);
  }

  const first = ordered[0]?.day;
  const last = ordered[ordered.length - 1]?.day;
  pages.push(`<section class="end">
    ${seal(54)}
    <div class="end-text">${ordered.length} ${ordered.length === 1 ? 'entry' : 'entries'}${
      first ? ` · ${formatMonthDay(first)}${last && last !== first ? ` – ${formatMonthDay(last)}` : ''}` : ''
    }</div>
  </section>`);

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: 8in 8in; margin: 0.6in 0.65in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${c.card}; color: ${c.ink}; }
  body { font-family: 'Work Sans', -apple-system, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  section { page-break-after: always; break-after: page; }
  section:last-child { page-break-after: auto; break-after: auto; }
  .serif, h2, .brand, .leg-city, .cover-sub { font-family: 'Newsreader', Georgia, 'Times New Roman', serif; font-weight: 400; }
  .cover { height: 6.75in; display: flex; flex-direction: column; justify-content: flex-end; }
  .cover-photo { flex: 1; min-height: 0; margin-bottom: 0.3in; border-radius: 14pt; overflow: hidden; }
  .cover-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .brand { font-size: 40pt; line-height: 1; letter-spacing: -0.5pt; display: flex; align-items: center; gap: 10pt; }
  .brand em { color: ${c.highlight}; }
  .cover-sub { font-size: 17pt; font-style: italic; margin-top: 8pt; color: ${c.inkSecondary}; }
  .cover-meta { font-size: 9.5pt; margin-top: 10pt; color: ${c.inkSecondary}; letter-spacing: 0.2pt; }
  .leg { height: 6.75in; display: flex; flex-direction: column; justify-content: center; }
  .leg-rule { width: 54pt; height: 5pt; border-radius: 3pt; margin-bottom: 16pt; }
  .leg-city { font-size: 46pt; line-height: 1.05; letter-spacing: -0.6pt; }
  .leg-meta { font-size: 11pt; margin-top: 10pt; font-weight: 500; }
  .kicker { font-size: 9pt; font-weight: 600; letter-spacing: 0.6pt; text-transform: uppercase; }
  h2 { font-size: 24pt; line-height: 1.15; margin: 6pt 0 10pt; letter-spacing: -0.3pt; }
  .body p { margin: 0 0 8pt; }
  .photos { margin: 12pt 0 4pt; }
  .photos figure { margin: 0; break-inside: avoid; page-break-inside: avoid; }
  .photos img { width: 100%; display: block; border-radius: 8pt; object-fit: cover; }
  .photos.one img { max-height: 4.6in; }
  .photos.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
  .photos.grid img { height: 2.55in; }
  figcaption { font-size: 8.5pt; color: ${c.inkSecondary}; margin-top: 4pt; }
  .voice { display: flex; gap: 12pt; align-items: center; margin-top: 12pt; padding: 10pt; border: 0.75pt solid ${c.border}; border-radius: 10pt; break-inside: avoid; page-break-inside: avoid; }
  .qr { width: 1.15in; height: 1.15in; flex: none; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .voice-title { font-weight: 600; }
  .voice-caption { margin-top: 2pt; }
  .voice-hint { font-size: 8.5pt; color: ${c.inkSecondary}; margin-top: 4pt; }
  .end { height: 6.75in; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14pt; }
  .end-text { font-size: 10pt; color: ${c.inkSecondary}; }
</style></head><body>${pages.join('\n')}</body></html>`;
}

/**
 * Builds the PDF and opens the share sheet (save to Files, print, AirDrop,
 * upload to a print service). On web, `printWindow` (opened synchronously
 * by the button press, so popup blockers allow it) gets the book to print.
 */
export async function exportPhotoBook(
  entries: JournalEntry[],
  author: string,
  progress: BookProgress,
  printWindow?: Window | null,
): Promise<void> {
  const html = await buildPhotoBookHtml(entries, author, progress);
  if (Platform.OS === 'web') {
    const win = printWindow ?? window.open('', '_blank');
    if (!win) throw new Error('Allow pop-ups for this site to open the photo book.');
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.title = 'Epic Asia photo book';
    // Give the web fonts and embedded photos a moment before the print dialog.
    setTimeout(() => win.print(), 900);
    return;
  }
  progress('Making the PDF…');
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html, width: PAGE, height: PAGE });
  const { File, Paths } = await import('expo-file-system');
  const named = new File(Paths.cache, `Epic Asia photo book - ${author}.pdf`);
  if (named.exists) named.delete();
  new File(uri).move(named);
  await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Your photo book' });
}
