import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../../theme/colors';

// Runs a self-contained HTML game (e.g. assets/games/rampage.html) full
// size. Native: a WebView; web: an iframe (GameFrame.web.tsx). The game
// talks back with JSON messages ({ type, ... }), handed to onMessage.

export type GameFrameProps = {
  html: string;
  title: string;
  onMessage: (msg: { type?: unknown } & Record<string, unknown>) => void;
};

export default function GameFrame({ html, title, onMessage }: GameFrameProps) {
  return (
    <WebView
      source={{ html, baseUrl: '' }}
      originWhitelist={['*']}
      accessibilityLabel={title}
      style={styles.frame}
      containerStyle={styles.frame}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      // The game draws to the safe area itself (env(safe-area-inset-*)).
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      setSupportMultipleWindows={false}
      onMessage={(e) => {
        try {
          const msg = JSON.parse(e.nativeEvent.data);
          if (msg && typeof msg === 'object') onMessage(msg);
        } catch {
          // not ours
        }
      }}
    />
  );
}

const styles = StyleSheet.create({ frame: { flex: 1, backgroundColor: colors.arcade } });
