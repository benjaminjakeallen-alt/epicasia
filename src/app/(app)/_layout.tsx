import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/AuthProvider';

export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
