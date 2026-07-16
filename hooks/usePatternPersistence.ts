import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { PatternConfig, DualGrid, DEFAULT_PATTERN_NAME } from '../types/pattern';
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from '../utils/storage';
import { savePattern, formatPatternNumber, isPatternNameTaken, deletePattern } from '../utils/patterns';

type NameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

// Everything to do with loading/saving/naming/deleting this pattern -
// hydrating from local storage on mount, debounced autosave, the two
// debounced "is this name taken" checks (title bar + Save As New modal,
// which were previously two separately-written copies of the same
// debounce pattern - now one shared effect factory), and the actual
// Save/Save As New/Delete network calls. Extracted out of BuildScreen.tsx,
// which still owns dualGrid/palette themselves (it needs them directly for
// grid editing) and just passes them in here.
export function usePatternPersistence(
  config: PatternConfig,
  onConfigChange: (config: PatternConfig) => void,
  onExit: () => void,
  user: User | null,
  dualGrid: DualGrid,
  palette: (string | null)[],
  setPalette: Dispatch<SetStateAction<(string | null)[]>>,
  setDualGrid: Dispatch<SetStateAction<DualGrid>>
) {
  const isSignedIn = !!user;

  const [name, setName] = useState(config.name);
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle');
  const [saveAsNewNameStatus, setSaveAsNewNameStatus] = useState<NameStatus>('idle');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAccountRequiredModal, setShowAccountRequiredModal] = useState(false);
  const [showSaveAsNewModal, setShowSaveAsNewModal] = useState(false);
  const [saveAsNewName, setSaveAsNewName] = useState('');
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [cloudSaveError, setCloudSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, check local storage for previously-cached progress on this
  // exact pattern (e.g. from before a refresh) and restore it instead of
  // starting from the blank grid / initial palette.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await storageGet<{ dualGrid: DualGrid; palette: (string | null)[] }>(
        STORAGE_KEYS.patternState(config.id)
      );
      if (!cancelled && saved) {
        setDualGrid(saved.dualGrid);
        setPalette(saved.palette);
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.id]);

  // Debounced auto-save: waits until painting/edits pause briefly before
  // writing, so a click-and-drag stroke doesn't trigger a write per cell.
  useEffect(() => {
    if (!hydrated) return; // don't stomp saved data with the initial defaults pre-hydration
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      storageSet(STORAGE_KEYS.patternState(config.id), { dualGrid, palette });
    }, 400);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [dualGrid, palette, hydrated, config.id]);

  // Live "is this name available" check on the title bar, same debounced
  // pattern as Settings' username check. Excludes this pattern's own
  // client_id so re-saving under the name it already has doesn't flag
  // itself as a collision.
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || !user) {
      setNameStatus('idle');
      return;
    }

    setNameStatus('checking');
    const timeout = setTimeout(async () => {
      const { taken, error } = await isPatternNameTaken(user.id, trimmed, config.id);
      setNameStatus(error ? 'error' : taken ? 'taken' : 'available');
    }, 500);

    return () => clearTimeout(timeout);
  }, [name, user, config.id]);

  // Same check for the Save As New modal's name field - no exclusion here,
  // since a copy sharing the current pattern's own name would be a real
  // duplicate too.
  useEffect(() => {
    const trimmed = saveAsNewName.trim();
    if (!trimmed || !user || !showSaveAsNewModal) {
      setSaveAsNewNameStatus('idle');
      return;
    }

    setSaveAsNewNameStatus('checking');
    const timeout = setTimeout(async () => {
      const { taken, error } = await isPatternNameTaken(user.id, trimmed);
      setSaveAsNewNameStatus(error ? 'error' : taken ? 'taken' : 'available');
    }, 500);

    return () => clearTimeout(timeout);
  }, [saveAsNewName, user, showSaveAsNewModal]);

  function handlePaletteChange(newPalette: (string | null)[], newColorCount: number) {
    setPalette(newPalette);
    onConfigChange({ ...config, palette: newPalette, colorCount: newColorCount, updatedAt: Date.now() });
  }

  async function handleSave() {
    // Local save always happens first, and always succeeds - this is the
    // part the offline-first design depends on, and it's never blocked by
    // the cloud sync below.
    const updatedConfig: PatternConfig = { ...config, name, palette, updatedAt: Date.now() };
    onConfigChange(updatedConfig);

    if (!user) return; // handleSavePress already gates this - just a safety net

    setIsSavingCloud(true);
    setCloudSaveError(null);
    const { displayNumber, error } = await savePattern(user.id, updatedConfig, dualGrid);

    // If the user never gave this pattern a real name, the first
    // successful save is what assigns its permanent "Bracelet #N" name -
    // using the number the database just generated. This can't happen any
    // earlier, since that number doesn't exist until the row is actually
    // inserted.
    if (!error && displayNumber != null && updatedConfig.name === DEFAULT_PATTERN_NAME) {
      const finalName = `Bracelet #${formatPatternNumber(displayNumber)}`;
      const renamedConfig: PatternConfig = { ...updatedConfig, name: finalName };
      setName(finalName);
      onConfigChange(renamedConfig);
      const renameResult = await savePattern(user.id, renamedConfig, dualGrid);
      if (renameResult.error) setCloudSaveError(renameResult.error);
    }

    setIsSavingCloud(false);

    if (error) setCloudSaveError(error);
    setShowSavedModal(true);
  }

  function handleSavePress() {
    if (!isSignedIn) {
      setShowAccountRequiredModal(true);
      return;
    }
    if (nameStatus === 'taken' || nameStatus === 'checking') return;
    handleSave();
  }

  function openSaveAsNew() {
    if (!isSignedIn) {
      setShowAccountRequiredModal(true);
      return;
    }
    setSaveAsNewName(`${name} copy`);
    setShowSaveAsNewModal(true);
  }

  async function handleSaveAsNew() {
    if (!user) return;
    if (saveAsNewNameStatus === 'taken' || saveAsNewNameStatus === 'checking') return;

    const now = Date.now();
    const newConfig: PatternConfig = {
      ...config,
      id: String(now),
      name: saveAsNewName.trim() || `${name} copy`,
      palette,
      createdAt: now,
      updatedAt: now,
    };

    setShowSaveAsNewModal(false);
    setIsSavingCloud(true);
    setCloudSaveError(null);
    const { displayNumber, error } = await savePattern(user.id, newConfig, dualGrid);

    // Same placeholder-rename logic as a normal Save, for the rare case
    // where a never-yet-named pattern gets copied before ever being saved.
    let finalConfig = newConfig;
    if (!error && displayNumber != null && newConfig.name === DEFAULT_PATTERN_NAME) {
      const finalName = `Bracelet #${formatPatternNumber(displayNumber)}`;
      finalConfig = { ...newConfig, name: finalName };
      const renameResult = await savePattern(user.id, finalConfig, dualGrid);
      if (renameResult.error) setCloudSaveError(renameResult.error);
    }

    setIsSavingCloud(false);
    if (error) setCloudSaveError(error);

    // Mirror "Save As" convention: focus switches to the new copy going
    // forward. The original pattern's saved row is left completely
    // untouched.
    setName(finalConfig.name);
    onConfigChange(finalConfig);
    setShowSavedModal(true);
  }

  // Soft delete - the row (if this pattern was ever actually saved) stays
  // in the database with deleted_at set, it just no longer shows up in My
  // Designs. If this pattern was never saved (signed out, or saved locally
  // but never synced), there's nothing to delete server-side - just clear
  // the local cache and leave, same as Start Over.
  async function handleDeletePattern() {
    setShowDeleteConfirm(false);

    if (user) {
      setIsDeleting(true);
      const { error } = await deletePattern(user.id, config.id);
      setIsDeleting(false);
      if (error) {
        setCloudSaveError(error);
        return; // stay on the screen if the delete itself failed
      }
    }

    storageRemove(STORAGE_KEYS.patternState(config.id));
    onExit();
  }

  return {
    name, setName, nameStatus,
    isSavingCloud, cloudSaveError,
    showDeleteConfirm, setShowDeleteConfirm, isDeleting,
    showAccountRequiredModal, setShowAccountRequiredModal,
    showSaveAsNewModal, setShowSaveAsNewModal,
    saveAsNewName, setSaveAsNewName, saveAsNewNameStatus,
    showSavedModal, setShowSavedModal,
    handlePaletteChange, handleSavePress, openSaveAsNew, handleSaveAsNew, handleDeletePattern,
  };
}
