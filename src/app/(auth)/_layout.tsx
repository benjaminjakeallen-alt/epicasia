import { Redirect, Stack } from 'expo-router';
import { ScreenTransition } from '../../components/shell/motion';
import { useAuth } from '../../lib/AuthProvider';

export default function AuthLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return null;
  if (session) return <Redirect href="/(app)" />;

  return <Stack
      screenOptions={{ headerShown: false }}
      screenLayout={({ children }) => <ScreenTransition>{children}</ScreenTransition>}
    />;
}
