import {
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
} from '@expo-google-fonts/newsreader';
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
} from '@expo-google-fonts/work-sans';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LaunchSequence from '../components/LaunchSequence';
import { introModeForLaunch, markFullIntroSeen, type IntroMode } from '../lib/introPrefs';
import { AuthProvider } from '../lib/AuthProvider';
import { colors } from '../theme/colors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  const [introDone, setIntroDone] = useState(false);
  // Full intro the first time (and after updates), a short one after that.
  const [introMode, setIntroMode] = useState<IntroMode | null>(null);
  useEffect(() => {
    introModeForLaunch().then(setIntroMode);
  }, []);

  useEffect(() => {
    if (fontsLoaded && introMode) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, introMode]);

  if (!fontsLoaded || !introMode) {
    return null;
  }

  return (
    <AuthProvider>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
        />
        {!introDone && introMode !== 'none' && (
          <LaunchSequence
            variant={introMode === 'short' ? 'short' : 'full'}
            onFinish={() => {
              if (introMode === 'full') markFullIntroSeen();
              setIntroDone(true);
            }}
          />
        )}
      </SafeAreaProvider>
    </AuthProvider>
  );
}
