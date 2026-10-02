import { useMemo } from 'react';
import JournalEditor from '../../../components/journal/JournalEditor';
import { useAuth } from '../../../lib/AuthProvider';
import { todayDay } from '../../../lib/dates';
import { emptyDraft } from '../../../lib/journal';
import { stopForDay } from '../../../lib/places';

export default function NewJournalEntry() {
  const { session } = useAuth();
  const draft = useMemo(() => {
    const day = todayDay();
    return emptyDraft(day, stopForDay(day)?.city ?? '');
  }, []);
  if (!session) return null;
  return <JournalEditor initial={draft} previous={null} userId={session.user.id} />;
}
