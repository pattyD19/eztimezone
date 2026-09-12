import { useEffect, useMemo } from 'react';
import { TimelineStore } from './state/TimelineStore';
import { TimelineContext } from './state/timelineContext';
import { useZones } from './state/useZones';
import { useClockPref } from './state/usePrefs';
import { readShareState } from './lib/share';
import { Timeline } from './ui/Timeline';
import { Toolbar } from './ui/Toolbar';
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

        <Timeline zones={zones} home={home} use24Hour={use24Hour} onRemove={remove} />

        <ZonePicker zones={zones} canAdd={canAdd} onAdd={add} />

        <footer className="notes">
          <h2>How it reads</h2>
          <ul>
            <li>
              The green ribbon is every span where all your zones are inside working hours,
              weekends excluded. Hover one for the exact times in your own zone.
            </li>
            <li>
              One shared instant drives every row. Hour ticks are computed per zone, so
              half-hour offsets like Kolkata sit where they really are rather than snapping
              to the row above.
            </li>
            <li>
              Amber band is 09:00–17:00 local; the dark band is 22:00–07:00. Morning hours
              are teal, afternoon and evening violet.
            </li>
            <li>
              Daylight-saving changes inside the visible span are found by binary search, so
              the grid stays correct across a spring-forward.
            </li>
            <li>Settling snaps to the nearest quarter hour. Your zones and clock format persist per browser.</li>
          </ul>
        </footer>
      </main>
    </TimelineContext.Provider>
  );
}
