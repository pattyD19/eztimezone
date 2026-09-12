import { createContext, useContext } from 'react';
import type { TimelineStore } from './TimelineStore';

export const TimelineContext = createContext<TimelineStore | null>(null);

export function useTimeline(): TimelineStore {
  const store = useContext(TimelineContext);
  if (!store) throw new Error('useTimeline must be used inside <TimelineProvider>');
  return store;
}
