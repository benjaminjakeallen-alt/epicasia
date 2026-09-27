import { Redirect } from 'expo-router';
import { useAuth } from '../lib/AuthProvider';

export default function RootIndex() {
  const { session, initializing } = useAuth();

  if (initializing) return null;

  return <Redirect href={session ? '/(app)' : '/(auth)/login'} />;
}
