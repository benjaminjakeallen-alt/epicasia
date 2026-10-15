import { useEffect, useRef, type MutableRefObject } from 'react';

export type GameFrameProps = {
  html: string;
  title: string;
  onMessage: (msg: { type?: unknown } & Record<string, unknown>) => void;
  /** Filled with a function that posts into the game (Tug of Wall's network relay). */
  postRef?: MutableRefObject<((data: unknown) => void) | null>;
};

// The game in a sandboxed iframe (scripts only, its own null origin). It
// posts { source: 'rampage', type, ... } to this window; only messages from
// this iframe are accepted.

export default function GameFrame({ html, title, onMessage, postRef }: GameFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const handler = useRef(onMessage);
  useEffect(() => {
    if (!postRef) return;
    // (the game's window has a null origin, so '*' is the only target that reaches it)
    postRef.current = (data) => ref.current?.contentWindow?.postMessage(data, '*');
    return () => {
      postRef.current = null;
    };
  }, [postRef]);
  useEffect(() => {
    handler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    function listen(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const msg = e.data;
      if (msg && typeof msg === 'object') handler.current(msg);
    }
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      // Focus the game's own window so the arrow keys and Space reach it.
      onLoad={() => ref.current?.contentWindow?.focus()}
      sandbox="allow-scripts"
      allow="autoplay"
      data-testid="game-frame"
      style={{ flex: 1, width: '100%', height: '100%', border: 0, display: 'block' }}
    />
  );
}
