import { useCallback, useEffect, useState } from 'react';
import { readString, writeString } from '../lib/storage';

const CLOCK_KEY = 'eztz.use24Hour';

export interface ClockPref {
  use24Hour: boolean;
  setUse24Hour: (value: boolean) => void;
}

/** 12-hour with AM/PM is the default; the choice persists per browser. */
export function useClockPref(): ClockPref {
  const [use24Hour, setUse24Hour] = useState(() => readString(CLOCK_KEY) === '1');

  useEffect(() => {
    writeString(CLOCK_KEY, use24Hour ? '1' : '0');
  }, [use24Hour]);

  return { use24Hour, setUse24Hour: useCallback((v: boolean) => setUse24Hour(v), []) };
}
