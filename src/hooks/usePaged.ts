import { useCallback, useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';

/**
 * A long list shown a page at a time: the first `page` items, then another page each time the scroll
 * comes within a screen or so of the end. The photo games' walls use it so a whole trip's worth of
 * finds isn't loaded (and decoded) at once. `resetKey` (the tab, the filter) starts again from the top —
 * the first page, scrolled back up (attach `ref` to the ScrollView).
 */
export function usePaged<T>(items: T[], resetKey: string, page = 20) {
  const [state, setState] = useState({ key: resetKey, limit: page });
  // (a new tab or filter: back to the first page — adjusted while rendering, React's pattern for this)
  if (state.key !== resetKey) setState({ key: resetKey, limit: page });
  const limit = state.key === resetKey ? state.limit : page;
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    ref.current?.scrollTo({ y: 0, animated: false });
  }, [resetKey]);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      if (contentOffset.y + layoutMeasurement.height > contentSize.height - layoutMeasurement.height * 1.5)
        setState((s) => (s.limit < items.length ? { ...s, limit: s.limit + page } : s));
    },
    [items.length, page],
  );
  return { visible: items.slice(0, limit), onScroll, ref, more: items.length > limit };
}
