import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { RowTechnique, RowTechniques, BuildProgress } from '../types/pattern';
import { storageGet, storageSet, STORAGE_KEYS } from '../utils/storage';
import { loadBuildProgress, saveBuildProgress } from '../utils/patterns';

// Build Center's equivalent of usePatternPersistence's autosave - local
// cache always wins on load if present (same "resume mid-progress after a
// refresh, even before a debounced write reached the server" reasoning as
// the pattern editor), and every change still debounces a save that writes
// local first (always succeeds) then best-effort syncs to the cloud - this
// keeps working exactly as before even if the person never touches the
// Save Progress button. `hasUnsavedChanges` and `saveNow` exist on top of
// that for the button itself and the "leave without saving?" warning -
// `hasUnsavedChanges` is true only in the brief window between a change
// and the debounce actually flushing, or if the last flush failed (e.g.
// offline), so the warning only fires when there's something genuinely
// not yet on disk.
export function useBuildProgress(user: User | null, clientId: string | null) {
  const [rowTechniques, setRowTechniques] = useState<RowTechniques>([]);
  const [buildProgress, setBuildProgress] = useState<BuildProgress>([]);
  const [hydrated, setHydrated] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setHydrated(false);
    (async () => {
      const cached = await storageGet<{ rowTechniques: RowTechniques; buildProgress: BuildProgress }>(
        STORAGE_KEYS.buildProgress(clientId)
      );
      if (cached) {
        if (!cancelled) {
          setRowTechniques(cached.rowTechniques);
          setBuildProgress(cached.buildProgress);
          setHydrated(true);
        }
        return;
      }
      if (user) {
        const { rowTechniques: fetched, buildProgress: fetchedProgress } =
          await loadBuildProgress(user.id, clientId);
        if (!cancelled) {
          setRowTechniques(fetched ?? []);
          setBuildProgress(fetchedProgress ?? []);
        }
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [clientId, user]);

  function flushSave() {
    if (!clientId) return;
    storageSet(STORAGE_KEYS.buildProgress(clientId), { rowTechniques, buildProgress });
    setHasUnsavedChanges(false);
    if (user) saveBuildProgress(user.id, clientId, rowTechniques, buildProgress);
  }

  // Debounced auto-save - waits until a burst of marks/overrides pauses
  // briefly, same 400ms shape as the pattern editor's grid autosave.
  useEffect(() => {
    if (!hydrated || !clientId) return;
    setHasUnsavedChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(flushSave, 400);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowTechniques, buildProgress, hydrated, clientId, user]);

  // Forces an immediate save, bypassing the debounce - what the Save
  // Progress button calls.
  function saveNow() {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    flushSave();
  }

  function markRowDone(rowIndex: number) {
    setBuildProgress(prev => (prev.includes(rowIndex) ? prev : [...prev, rowIndex]));
  }

  function undoRowDone(rowIndex: number) {
    setBuildProgress(prev => prev.filter(i => i !== rowIndex));
  }

  function setRowTechnique(rowIndex: number, technique: RowTechnique | null) {
    setRowTechniques(prev => {
      const updated = [...prev];
      updated[rowIndex] = technique;
      return updated;
    });
  }

  return { rowTechniques, buildProgress, markRowDone, undoRowDone, setRowTechnique, hasUnsavedChanges, saveNow };
}
