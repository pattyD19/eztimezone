import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { offsetAt, offsetLabel } from '../time/format';
import { searchZones, zoneLabel, zoneRegion } from '../time/zones';
import { MAX_ZONES } from '../state/useZones';

export interface ZonePickerProps {
  zones: readonly string[];
  canAdd: boolean;
  onAdd: (tz: string) => void;
}

export function ZonePicker({ zones, canAdd, onAdd }: ZonePickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = useMemo(
    () => searchZones(query).filter((id) => !zones.includes(id)),
    [query, zones],
  );

  useEffect(() => {
    const onDocumentPointerDown = (e: PointerEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', onDocumentPointerDown);
  }, []);

  const choose = (id: string): void => {
    onAdd(id);
    setQuery('');
    setOpen(false);
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="picker" ref={boxRef}>
      <input
        type="search"
        value={query}
        // readOnly rather than disabled: a disabled field is removed from the
        // tab order, so a keyboard or screen-reader user never reaches it and
        // never learns why they cannot add a zone. This stays focusable and
        // says so, and the label carries the reason since a placeholder is not
        // reliably announced when an aria-label is present.
        readOnly={!canAdd}
        aria-disabled={!canAdd}
        placeholder={
          canAdd
            ? 'Add a city or timezone…'
            : `${MAX_ZONES} zones — remove one to add another`
        }
        aria-label={
          canAdd
            ? 'Search for a city or timezone'
            : `Zone list is full at ${MAX_ZONES}. Remove a zone before adding another.`
        }
        aria-expanded={showList}
        aria-controls={listId}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => canAdd && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && results[0]) choose(results[0]);
        }}
      />

      {showList && (
        <div className="results" id={listId} role="listbox">
          {results.length === 0 ? (
            <p className="empty">No zone matches “{query.trim()}”.</p>
          ) : (
            results.map((id) => (
              <button key={id} className="result" role="option" onClick={() => choose(id)}>
                <span>
                  <span className="result-name">{zoneLabel(id)}</span>{' '}
                  <span className="result-region">{zoneRegion(id)}</span>
                </span>
                <span className="result-offset">{offsetLabel(offsetAt(id, Date.now()))}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
