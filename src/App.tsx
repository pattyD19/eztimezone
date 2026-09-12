import { useEffect, useMemo } from 'react';
import { TimelineStore } from './state/TimelineStore';
import { TimelineContext } from './state/timelineContext';
import { useZones } from './state/useZones';
import { useClockPref } from './state/usePrefs';
import { readShareState } from './lib/share';
import { DstNotice } from './ui/DstNotice';
import { Timeline } from './ui/Timeline';
import { Toolbar } from './ui/Toolbar';
import { VersionStamp } from './ui/VersionStamp';
import { ZonePicker } from './ui/ZonePicker';

export function App() {
  const store = useMemo(() => new TimelineStore(), []);
  const { zones, home, add, remove, canAdd } = useZones();
  const { use24Hour, setUse24Hour } = useClockPref();

  // A shared link carries a chosen instant, so the playhead should not be live.
  useEffect(() => {
    const { instant } = readShareState();
    if (instant !== null) store.setCentre(instant);
    store.requestFrame();
    return () => store.destroy();
  }, [store]);

  return (
    <TimelineContext.Provider value={store}>
      <main className="app">
        <Toolbar zones={zones} use24Hour={use24Hour} onClockChange={setUse24Hour} />

        <p className="hint">
          Drag <b>any</b> strip sideways — all five move together. The amber line is the
          moment you’ve picked. Pinch or scroll to zoom.
        </p>

        <DstNotice zones={zones} home={home} />

        <Timeline zones={zones} home={home} use24Hour={use24Hour} onRemove={remove} />

        <ZonePicker zones={zones} canAdd={canAdd} onAdd={add} />

        <VersionStamp />
      </main>
    </TimelineContext.Provider>
  );
}
