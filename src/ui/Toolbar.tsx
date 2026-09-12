import { useCallback, useRef, useState } from 'react';
import { buildShareUrl } from '../lib/share';
import { useFollowing } from '../state/hooks';
import { useTimeline } from '../state/timelineContext';

export interface ToolbarProps {
  zones: readonly string[];
  use24Hour: boolean;
  onClockChange: (use24Hour: boolean) => void;
}

export function Toolbar({ zones, use24Hour, onClockChange }: ToolbarProps) {
  const store = useTimeline();
  const following = useFollowing();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const share = useCallback(() => {
    const url = buildShareUrl(zones, store.getCentre());
    try {
      window.history.replaceState(null, '', url);
    } catch {
      /* some embeddings disallow history writes; the clipboard copy still works */
    }
    navigator.clipboard
      ?.writeText(url)
      .then(() => flash('Link copied'))
      .catch(() => flash('Link is in the address bar'));
  }, [zones, store, flash]);

  return (
    <header className="bar">
      <div className="brand">
        <h1>EzTimeZone</h1>
      </div>

      <div className="controls">
        <div className="seg" role="group" aria-label="Clock format">
          <button aria-pressed={!use24Hour} onClick={() => onClockChange(false)}>
            12h
          </button>
          <button aria-pressed={use24Hour} onClick={() => onClockChange(true)}>
            24h
          </button>
        </div>

        <div className="seg">
          <button aria-label="Zoom out" onClick={() => store.zoomAtCentre(1 / 1.5)}>
            &minus;
          </button>
          <button aria-label="Zoom in" onClick={() => store.zoomAtCentre(1.5)}>
            +
          </button>
        </div>

        <button onClick={share}>Share</button>
        <button
          className="primary"
          onClick={() => store.goNow()}
          disabled={following}
          aria-label={following ? 'Already showing the current time' : 'Jump to the current time'}
        >
          Now
        </button>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </header>
  );
}
