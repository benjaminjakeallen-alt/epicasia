// Keeps the Home Screen app on the newest build. iPhone resumes a Home
// Screen web app from memory instead of reloading it, so a traveller could
// keep running an old build for days after a deploy (it happened: someone
// still saw the old Shinkansen Dash line-up). The page names its build in
// the entry script's file name (Expo puts a content hash in it), so: when
// the app comes back to the front, and every so often while it's open,
// fetch the page fresh and compare.

const CHECK_EVERY_MS = 15 * 60 * 1000;

/** The entry script a page loads (its build), from the page's HTML. */
export function buildOf(html: string): string | null {
  const m = html.match(/<script[^>]+src="([^"]*entry[^"]*)"/);
  return m ? m[1] : null;
}

/** The build this page is running. */
function runningBuild(): string | null {
  if (typeof document === 'undefined') return null;
  const s = Array.from(document.querySelectorAll('script[src]')).find((el) => /entry/.test(el.getAttribute('src') ?? ''));
  return s?.getAttribute('src') ?? null;
}

/** The build the site is serving now (never from a cache). */
async function latestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/?__v=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? buildOf(await res.text()) : null;
  } catch {
    return null; // offline: try again later
  }
}

/**
 * Calls `onUpdate(resumed)` once a newer build is on the site — `resumed`
 * is true when it was found as the app came back to the front.
 */
export function watchForUpdate(onUpdate: (resumed: boolean) => void): () => void {
  const running = runningBuild();
  if (!running || typeof document === 'undefined') return () => {};
  let found = false, busy = false;
  const check = async (resumed: boolean) => {
    if (found || busy) return;
    busy = true;
    const latest = await latestBuild();
    busy = false;
    if (latest && latest !== running && !found) {
      found = true;
      onUpdate(resumed);
    }
  };
  const onVisible = () => document.visibilityState === 'visible' && check(true);
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(() => document.visibilityState === 'visible' && check(false), CHECK_EVERY_MS);
  check(false);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(timer);
  };
}

export function reloadApp() {
  window.location.reload();
}
