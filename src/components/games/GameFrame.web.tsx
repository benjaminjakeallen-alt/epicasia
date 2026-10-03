import { useEffect, useRef } from 'react';
import type { GameFrameProps } from './GameFrame';

// Web build: the game in a sandboxed iframe (scripts only, its own null
// origin). It posts { source: 'rampage', type, ... } to this window; only
// messages from this iframe are accepted.

export default function GameFrame({ html, title, onMessage }: GameFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const handler = useRef(onMessage);
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
