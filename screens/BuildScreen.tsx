import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { PatternConfig, DualGrid, DEFAULT_PATTERN_NAME, createEmptyGrid } from '../types/pattern';
import ColorPickerScreen from './ColorPickerScreen';
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import { savePattern, formatPatternNumber, isPatternNameTaken, deletePattern } from '../utils/patterns';
import { useTheme } from '../context/ThemeContext';
import { Theme } from '../constants/theme';
import { BuildEditorContext, BuildEditorContextValue } from '../context/BuildEditorContext';
import PatternGridView, { FloatingCell } from '../components/PatternGridView';
import GridEdgeControls from '../components/GridEdgeControls';
import {
  StartOverConfirmModal,
  DeletePatternModal,
  AccountRequiredModal,
  SaveAsNewModal,
  SavedModal,
} from '../components/BuildScreenModals';
import ColorsCard from '../components/build-cards/ColorsCard';
import SelectorCard from '../components/build-cards/SelectorCard';
import PatternToolCard from '../components/build-cards/PatternToolCard';
import BehaviorControlsCard from '../components/build-cards/BehaviorControlsCard';
import ModeIndicator from '../components/build-cards/ModeIndicator';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// How far to the right (in columns) a fresh Duplicate/Move copy starts out
// from its source, so it's never dropped directly on top and looks
// obviously separate the moment it appears.
const FLOATING_OP_DEFAULT_OFFSET = 3;

// A Duplicate or Move in progress - a snapshot of the selected diamonds'
// original position/color plus a live (dr, dc) offset that changes as the
// user drags it around. For Duplicate, dualGrid isn't touched until Done
// commits it. For Move, the source is cleared immediately (see
// beginFloatingOp) so it visibly looks picked-up rather than duplicated -
// beforeSnapshot is the grid exactly as it was before that happened, so
// Cancel can restore it exactly and Done can record a single Undo step
// covering the whole pickup+drop.
type FloatingOp = {
  kind:  'duplicate' | 'move';
  cells: FloatingCell[]; // original (pre-drag) pass/r/c/color
  dr:    number;
  dc:    number;
  beforeSnapshot: DualGrid;
};

function snapshotGrid(grid: DualGrid): DualGrid {
  return { main: grid.main.map(row => row.slice()), gap: grid.gap.map(row => row.slice()) };
}

// True geometric neighbors of a diamond in the dual-grid weave (see
// utils/diamondGrid.ts for the actual position math). Diamonds only ever
// share a full edge with a diamond from the OTHER pass - two main beads (or
// two gap connectors) only ever touch at a single corner point, never an
// edge - so a main(r,c) cell's real neighbors are the 4 gap cells around
// it, and a gap(r,c) cell's real neighbors are the 4 main cells around it.
// rows/cols here are the MAIN grid's dimensions (gap is always rows+1 x
// cols+1).
function neighborsOf(
  pass: 'main' | 'gap',
  r: number,
  c: number,
  rows: number,
  cols: number
): { pass: 'main' | 'gap'; r: number; c: number }[] {
  if (pass === 'main') {
    // Always in-bounds: gap is rows+1 x cols+1, and r/c are within the main
    // grid's own rows/cols, so r, r+1 and c, c+1 always land inside gap.
    return [
      { pass: 'gap', r,     c     },
      { pass: 'gap', r,     c: c + 1 },
      { pass: 'gap', r: r + 1, c     },
      { pass: 'gap', r: r + 1, c: c + 1 },
    ];
  }
  const out: { pass: 'main' | 'gap'; r: number; c: number }[] = [];
  if (r - 1 >= 0 && c - 1 >= 0)         out.push({ pass: 'main', r: r - 1, c: c - 1 });
  if (r - 1 >= 0 && c <= cols - 1)      out.push({ pass: 'main', r: r - 1, c });
  if (r <= rows - 1 && c - 1 >= 0)      out.push({ pass: 'main', r, c: c - 1 });
  if (r <= rows - 1 && c <= cols - 1)   out.push({ pass: 'main', r, c });
  return out;
}

// Shared flood-fill used by both "Magic Wand" (grow the selection) and
// Recolor Selected (grow, then paint) - starting from every cell in
// `seeds`, walks the true touching neighbors (crossing between main and
// gap, per neighborsOf above) through same-color cells and returns the
// seeds plus everything reachable. Pure function (no component state) so
// both call sites can use it without duplicating the traversal.
function floodFillRegion(
  seeds: Set<string>,
  dualGrid: DualGrid,
  rows: number,
  cols: number
): Set<string> {
  const region = new Set<string>(seeds);
  const stack: { pass: 'main' | 'gap'; r: number; c: number; color: string | null }[] = [];
  seeds.forEach(key => {
    const [pass, rStr, cStr] = key.split(':') as ['main' | 'gap', string, string];
    const r = Number(rStr);
    const c = Number(cStr);
    const grid = pass === 'main' ? dualGrid.main : dualGrid.gap;
    const color = grid[r]?.[c] ?? null;
    stack.push({ pass, r, c, color });
  });

  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const n of neighborsOf(cur.pass, cur.r, cur.c, rows, cols)) {
      const key = n.pass + ':' + n.r + ':' + n.c;
      if (region.has(key)) continue;
      const grid = n.pass === 'main' ? dualGrid.main : dualGrid.gap;
      const color = grid[n.r]?.[n.c] ?? null;
      if (color !== cur.color) continue;
      region.add(key);
      stack.push({ pass: n.pass, r: n.r, c: n.c, color });
    }
  }

  return region;
}

// Mirrors a selection horizontally or vertically as one rigid piece - the
// shape's outline moves along with its colors, like flipping a sticker,
// not just a recolor of whatever cells happened to already be selected
// (that was the Wave 9 v1 bug: for an asymmetric shape like an arrow, most
// mirrored destinations landed outside the original selection and got
// silently dropped, so the outline never appeared to move). Main and gap
// each use their OWN bounding box independently (rather than one shared
// box across both) - this keeps every mirrored cell landing on a valid
// same-type slot (a bead never needs to become a connector or vice versa)
// without any special-casing. For a selection that forms a naturally
// bordered rectangle - the common case, e.g. a drag-selected block or the
// result of Magic Wand/Select Same Color - the two passes' bounding boxes
// share the same center, so the combined result reads as one consistent
// flip anyway.
//
// For every originally-selected cell, its color is written to its mirror
// position (mirror is its own inverse within a fixed bounding box, so this
// naturally produces the fully-swapped result for cells whose mirror
// partner was also selected). Any originally-selected cell whose mirror
// partner was NOT also selected is on its way to being vacated - it isn't
// part of the new (mirrored) footprint, so it's cleared to blank. Always
// stays within the pass's own bounding box, so this never needs off-grid
// handling the way Duplicate/Move does. Returns both the grid writes and
// the new selection footprint, since the shape moving means the selection
// itself has to move with it - the caller applies both together.
function flipSelection(
  selectedCells: Set<string>,
  dualGrid: DualGrid,
  axis: 'horizontal' | 'vertical'
): { writes: Map<string, string | null>; newSelection: Set<string> } {
  const writes = new Map<string, string | null>();
  const newSelection = new Set<string>();

  (['main', 'gap'] as const).forEach(pass => {
    const cells: { r: number; c: number }[] = [];
    const originalKeys = new Set<string>();
    selectedCells.forEach(key => {
      const [p, rStr, cStr] = key.split(':') as ['main' | 'gap', string, string];
      if (p !== pass) return;
      const r = Number(rStr);
      const c = Number(cStr);
      cells.push({ r, c });
      originalKeys.add(r + ':' + c);
    });
    if (cells.length === 0) return;

    const grid = pass === 'main' ? dualGrid.main : dualGrid.gap;
    const rMin = Math.min(...cells.map(cell => cell.r));
    const rMax = Math.max(...cells.map(cell => cell.r));
    const cMin = Math.min(...cells.map(cell => cell.c));
    const cMax = Math.max(...cells.map(cell => cell.c));

    function mirrorOf(cell: { r: number; c: number }): { r: number; c: number } {
      return {
        r: axis === 'vertical' ? rMin + rMax - cell.r : cell.r,
        c: axis === 'horizontal' ? cMin + cMax - cell.c : cell.c,
      };
    }

    for (const cell of cells) {
      const dest = mirrorOf(cell);
      const color = grid[cell.r]?.[cell.c] ?? null;
      const destKey = pass + ':' + dest.r + ':' + dest.c;
      writes.set(destKey, color);
      newSelection.add(destKey);
    }

    for (const cell of cells) {
      const mirrorPartner = mirrorOf(cell);
      const partnerWasSelected = originalKeys.has(mirrorPartner.r + ':' + mirrorPartner.c);
      if (!partnerWasSelected) {
        const key = pass + ':' + cell.r + ':' + cell.c;
        if (!writes.has(key)) writes.set(key, null);
      }
    }
  });

  return { writes, newSelection };
}

// Raw web CSS (not an RN StyleSheet), so it isn't part of the theme-object
// plumbing below - the color mirrors theme.text intentionally.
const titleInputStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#111',
  border: 'none',
  background: 'transparent',
  padding: 0,
  minWidth: 160,
  maxWidth: 320,
};

function createDualGrid(mainRows: number, mainCols: number): DualGrid {
  return {
    main: createEmptyGrid(mainCols, mainRows),
    gap:  createEmptyGrid(mainCols + 1, mainRows + 1),
  };
}

export default function BuildScreen({
  config,
  onConfigChange,
  onExit,
  onRequireAccount,
}: {
  config:           PatternConfig;
  onConfigChange:   (config: PatternConfig) => void;
  onExit:           () => void;
  onRequireAccount: () => void;
}) {
  const { user } = useAuth();
  const isSignedIn = !!user;
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [name, setName]                         = useState(config.name);
  const [nameStatus, setNameStatus]             = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'error'
  >('idle');
  const [saveAsNewNameStatus, setSaveAsNewNameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'error'
  >('idle');
  const [dualGrid, setDualGrid]                 = useState<DualGrid>(() => createDualGrid(config.rows, config.cols));
  const [palette, setPalette]                   = useState<(string | null)[]>(config.palette);
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [orientation, setOrientation]           = useState<'horizontal' | 'vertical'>('horizontal');
  const [zoomIdx, setZoomIdx]                   = useState(2);
  const [showColorPicker, setShowColorPicker]   = useState(false);
  const [manualZoomOverride, setManualZoomOverride] = useState<number | null>(null);
  const [gridViewportWidth, setGridViewportWidth] = useState(0);
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting]             = useState(false);
  const [showAccountRequiredModal, setShowAccountRequiredModal] = useState(false);
  const [showSaveAsNewModal, setShowSaveAsNewModal] = useState(false);
  const [saveAsNewName, setSaveAsNewName]       = useState('');
  const [showSavedModal, setShowSavedModal]     = useState(false);
  const [savedModalMode, setSavedModalMode]     = useState<'ask' | 'coming-soon'>('ask');
  const [isSavingCloud, setIsSavingCloud]       = useState(false);
  const [cloudSaveError, setCloudSaveError]     = useState<string | null>(null);
  const [hydrated, setHydrated]                 = useState(false);
  const saveTimeoutRef                          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toolMode, setToolMode]                 = useState<'paint' | 'select' | 'erase'>('paint');
  const [activeTab, setActiveTab] = useState<'selector' | 'pattern-tool' | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Select/Duplicate/Move. selectedCells holds the diamonds you've clicked
  // or dragged across (before Duplicate/Move) - keyed 'pass:r:c'. Once
  // Duplicate or Move is clicked, that selection snapshots into floatingOp
  // and selectedCells goes back to empty; while floatingOp is set, the tool
  // is locked into positioning that floating copy until Done or Cancel.
  const [selectedCells, setSelectedCells]       = useState<Set<string>>(new Set());
  const [floatingOp, setFloatingOp]             = useState<FloatingOp | null>(null);
  const grabAnchorRef                            = useRef<{ r: number; c: number } | null>(null);
  const grabStartOffsetRef                       = useRef<{ dr: number; dc: number }>({ dr: 0, dc: 0 });

  // Tracks whether the CURRENT press+drag gesture has already pushed a
  // history entry yet - lets a whole click-and-drag paint/erase stroke
  // collapse into exactly one Undo step (pushed lazily, the moment the
  // first real change happens) instead of either zero steps (the old bug -
  // direct painting/erasing never called pushHistory at all) or one step
  // per diamond touched (which would make Undo only creep back one pixel
  // at a time instead of undoing the whole stroke). Reset on release so the
  // next gesture gets its own fresh entry.
  const strokeHistoryPushedRef                   = useRef(false);

  const cardRowRef                               = useRef<View>(null);
  const [cardRowTop, setCardRowTop]              = useState(0);
  const [viewportHeight, setViewportHeight]      = useState(
    typeof window !== 'undefined' ? window.innerHeight : 0
  );

  // Fills exactly whatever space is left below the card row's own start
  // position - not a moment more (which caused an unwanted scrollbar) and
  // not a moment less (which left a white gap), since a fixed pixel value
  // can't adapt to different viewport heights or content amounts.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handleResize() { setViewportHeight(window.innerHeight); }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const cardRowMinHeight = Math.max(0, viewportHeight - cardRowTop);

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
  const historyRef                              = useRef<DualGrid[]>([]);
  const futureRef                               = useRef<DualGrid[]>([]); // redo stack

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

  const GRID_BASE = 40;
  const zoom = manualZoomOverride ?? ZOOM_LEVELS[zoomIdx];

  // onLayout alone doesn't reliably refire on web when a sibling above
  // (the grid) changes size and pushes this view without cardRowOuter's
  // own size changing - same root cause as the earlier click-position
  // bug. Re-measuring explicitly whenever something that can move the
  // grid's height changes is more robust than trusting onLayout alone.
  useEffect(() => {
    const id = setTimeout(() => {
      cardRowRef.current?.measureInWindow((x, y) => setCardRowTop(y));
    }, 0);
    return () => clearTimeout(id);
  }, [config.rows, zoom, orientation]);

  // gridScrollPadding no longer subtracts fixed page padding - the grid
  // now sits directly against its edge buttons, not page margins.
  const EDGE_COLUMN_WIDTH = 68; // matches edgeColControls: 20px margin + 28px button + 20px margin
  const availableGridWidth = Math.max(0, gridViewportWidth - EDGE_COLUMN_WIDTH * 2);
  const fitZoom = availableGridWidth > 0 && config.cols > 0
    ? availableGridWidth / (config.cols * GRID_BASE)
    : zoom;

  function handleFitToWindow() {
    setManualZoomOverride(fitZoom);
  }
  function stepZoomDown() {
    setManualZoomOverride(null);
    setZoomIdx(i => Math.max(0, i - 1));
  }
  function stepZoomUp() {
    setManualZoomOverride(null);
    setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1));
  }

  // A new action always invalidates whatever was redo-able - same as any
  // other undo/redo system, once you diverge from the "future" you had
  // before undoing, that future is no longer reachable.
  function pushHistory(snapshot?: DualGrid) {
    historyRef.current.push(snapshot ?? snapshotGrid(dualGrid));
    if (historyRef.current.length > 20) historyRef.current.shift();
    futureRef.current = [];
  }

  // Paint/Erase-specific: pushes a history entry only the first time it's
  // called since the last handleCellRelease, so an entire click-and-drag
  // stroke - however many diamonds it actually touches - lands as exactly
  // one Undo step, captured right before the stroke's first real change.
  function ensureStrokeHistory() {
    if (strokeHistoryPushedRef.current) return;
    pushHistory();
    strokeHistoryPushedRef.current = true;
  }

  function handleUndo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(snapshotGrid(dualGrid));
    if (futureRef.current.length > 20) futureRef.current.shift();
    setDualGrid(prev);
  }

  function handleRedo() {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(snapshotGrid(dualGrid));
    if (historyRef.current.length > 20) historyRef.current.shift();
    setDualGrid(next);
  }

  // While a Duplicate/Move copy is floating, the only thing a press can do
  // is grab it (if it landed on one of the floating diamonds) to start
  // dragging - everything else is locked until Done or Cancel resolves it.
  function handleCellPress(pass: 'main' | 'gap', r: number, c: number) {
    if (floatingOp) {
      const onFloating = floatingOp.cells.some(
        cell => cell.pass === pass && cell.r + floatingOp.dr === r && cell.c + floatingOp.dc === c
      );
      if (onFloating) {
        grabAnchorRef.current = { r, c };
        grabStartOffsetRef.current = { dr: floatingOp.dr, dc: floatingOp.dc };
      }
      return;
    }

    if (toolMode === 'select') {
      const key = pass + ':' + r + ':' + c;
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      return;
    }

    if (toolMode === 'erase') {
      const currentGrid = pass === 'main' ? dualGrid.main : dualGrid.gap;
      if (!currentGrid[r] || currentGrid[r][c] === undefined || currentGrid[r][c] === null) return; // nothing to erase
      ensureStrokeHistory();
      setDualGrid(prev => {
        const grid = (pass === 'main' ? prev.main : prev.gap).map(row => row.slice());
        if (!grid[r] || grid[r][c] === undefined || grid[r][c] === null) return prev;
        grid[r][c] = null;
        return pass === 'main' ? { ...prev, main: grid } : { ...prev, gap: grid };
      });
      return;
    }

    const color = palette[selectedColorIdx];
    if (!color) return;
    const currentGrid = pass === 'main' ? dualGrid.main : dualGrid.gap;
    if (!currentGrid[r] || currentGrid[r][c] === undefined) return; // out of bounds - no-op
    ensureStrokeHistory();
    setDualGrid(prev => {
      const grid = (pass === 'main' ? prev.main : prev.gap).map(row => row.slice());
      if (!grid[r] || grid[r][c] === undefined) return prev;
      grid[r][c] = grid[r][c] === color ? null : color;
      return pass === 'main' ? { ...prev, main: grid } : { ...prev, gap: grid };
    });
  }

  function handleCellDrag(pass: 'main' | 'gap', r: number, c: number) {
    if (floatingOp) {
      if (!grabAnchorRef.current) return; // press didn't land on the floating copy - locked
      const { r: r0, c: c0 } = grabAnchorRef.current;
      const { dr: dr0, dc: dc0 } = grabStartOffsetRef.current;
      const newDr = dr0 + (r - r0);
      const newDc = dc0 + (c - c0);
      setFloatingOp(prev => (prev ? { ...prev, dr: newDr, dc: newDc } : prev));
      return;
    }

    if (toolMode === 'select') {
      const key = pass + ':' + r + ':' + c;
      setSelectedCells(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
      return;
    }

    if (toolMode === 'erase') {
      const currentGrid = pass === 'main' ? dualGrid.main : dualGrid.gap;
      if (!currentGrid[r] || currentGrid[r][c] === undefined || currentGrid[r][c] === null) return; // nothing to erase
      ensureStrokeHistory();
      setDualGrid(prev => {
        const grid = (pass === 'main' ? prev.main : prev.gap).map(row => row.slice());
        if (!grid[r] || grid[r][c] === undefined || grid[r][c] === null) return prev;
        grid[r][c] = null;
        return pass === 'main' ? { ...prev, main: grid } : { ...prev, gap: grid };
      });
      return;
    }

    const color = palette[selectedColorIdx];
    if (!color) return;
    const currentGrid = pass === 'main' ? dualGrid.main : dualGrid.gap;
    if (!currentGrid[r] || currentGrid[r][c] === undefined || currentGrid[r][c] === color) return; // no-op - out of bounds, or already this color
    ensureStrokeHistory();
    setDualGrid(prev => {
      const grid = (pass === 'main' ? prev.main : prev.gap).map(row => row.slice());
      if (!grid[r] || grid[r][c] === undefined) return prev;
      if (grid[r][c] === color) return prev;
      grid[r][c] = color;
      return pass === 'main' ? { ...prev, main: grid } : { ...prev, gap: grid };
    });
  }

  function handleCellRelease() {
    grabAnchorRef.current = null;
    strokeHistoryPushedRef.current = false;
  }

  // Exactly one of Select Tool / Color Tool is active at all times - these
  // always SET the mode, they don't toggle it (there's no "neither" state).
  function selectSelectTool() {
    setToolMode('select');
  }

  function selectColorTool() {
    if (floatingOp) handleCancelFloating();
    setSelectedCells(new Set());
    setToolMode('paint');
  }

  // Delete/Erase Tool - click or drag diamonds to clear them back to blank,
  // regardless of whichever palette color happens to be selected. A
  // distinct tool from Color Tool (which only ever paints/toggles the
  // currently-selected color) rather than a special palette entry, since
  // "clear this diamond no matter what's on it" is a different operation
  // than painting.
  function selectEraseTool() {
    if (floatingOp) handleCancelFloating();
    setSelectedCells(new Set());
    setToolMode('erase');
  }

  // Clears the current selection so a new one can be started fresh, without
  // having to click every currently-selected diamond again to deselect it.
  // Only meaningful while there's no floating op (Duplicate/Move already own
  // the selection lifecycle at that point).
  function handleReset() {
    setSelectedCells(new Set());
  }

  // Rectangle "box select" - called once, on release, with every diamond
  // (either pass) whose center fell inside the dragged rectangle (see
  // PatternGridView's boxBounds/handleRelease, which expands the box by
  // half a diamond so it visually hugs whichever diamonds it swept over).
  // Always additive to the existing selection - same as a single click,
  // which only ever ADDS a diamond that wasn't already selected - so you
  // can drag a box over one area, then drag another box (or click
  // individual diamonds) to keep building up the selection rather than
  // starting over each time.
  function handleBoxSelect(cells: { pass: 'main' | 'gap'; r: number; c: number }[]) {
    if (cells.length === 0) return;
    setSelectedCells(prev => {
      const next = new Set(prev);
      cells.forEach(({ pass, r, c }) => next.add(pass + ':' + r + ':' + c));
      return next;
    });
  }

  // "Magic Wand" - grows the selection to include every diamond reachable
  // through true touching neighbors (crossing between main beads and gap
  // connectors, per neighborsOf/floodFillRegion above) that share an
  // already-selected diamond's exact color. Runs once per seed already in
  // the selection (not just one), so a multi-color multi-select expands
  // each of its own regions independently.
  function handleSelectConnected() {
    if (selectedCells.size === 0) return;
    setSelectedCells(prev => floodFillRegion(prev, dualGrid, config.rows, config.cols));
  }

  // Selects every diamond anywhere in the pattern - main or gap - that
  // shares an already-selected diamond's color, no adjacency requirement
  // (unlike Magic Wand). Searches both passes regardless of which pass the
  // seed itself is in, since a same-colored stripe is visually made up of
  // both bead and connector diamonds together. Blank (uncolored) seeds are
  // skipped, since "same color" doesn't mean anything for a blank diamond.
  function handleSelectSameColor() {
    if (selectedCells.size === 0) return;
    const colors = new Set<string>();
    selectedCells.forEach(key => {
      const [pass, rStr, cStr] = key.split(':') as ['main' | 'gap', string, string];
      const r = Number(rStr);
      const c = Number(cStr);
      const grid = pass === 'main' ? dualGrid.main : dualGrid.gap;
      const color = grid[r]?.[c];
      if (color) colors.add(color);
    });
    if (colors.size === 0) return;

    setSelectedCells(prev => {
      const next = new Set(prev);
      (['main', 'gap'] as const).forEach(pass => {
        const grid = pass === 'main' ? dualGrid.main : dualGrid.gap;
        grid.forEach((row, r) => {
          row.forEach((cellColor, c) => {
            if (cellColor && colors.has(cellColor)) next.add(pass + ':' + r + ':' + c);
          });
        });
      });
      return next;
    });
  }

  // Recolors the current selection to the given color - like Magic Wand,
  // first expands each selected diamond out to its whole connected
  // same-color region, so you don't have to Magic Wand then Recolor
  // Selected separately. The color comes in as an explicit argument (from
  // ColorsCard's own dedicated swatch), not the shared "active palette
  // color" used for painting. A no-op if nothing's selected or color is
  // blank.
  function handleRecolorSelection(color: string) {
    if (selectedCells.size === 0 || !color) return;
    const region = floodFillRegion(selectedCells, dualGrid, config.rows, config.cols);
    pushHistory();
    setDualGrid(prev => {
      const newMain = prev.main.map(row => row.slice());
      const newGap = prev.gap.map(row => row.slice());
      const gridFor = (pass: 'main' | 'gap') => (pass === 'main' ? newMain : newGap);
      region.forEach(key => {
        const [pass, rStr, cStr] = key.split(':') as ['main' | 'gap', string, string];
        const r = Number(rStr);
        const c = Number(cStr);
        const grid = gridFor(pass);
        if (grid[r] && grid[r][c] !== undefined) {
          grid[r][c] = color;
        }
      });
      return { main: newMain, gap: newGap };
    });
  }

  // Flip Horizontal / Flip Vertical - mirrors the selection as one rigid
  // piece (outline + colors together) using the shared flipSelection
  // helper, then moves the selection itself to the new mirrored footprint -
  // the shape visually moves, it isn't just a recolor of the cells that
  // happened to already be selected. Applies immediately (like Recolor
  // Selected), since the flip always stays within the selection's own
  // bounding box - never needs the floating-preview treatment Duplicate/
  // Move use for possible off-grid placement.
  function applyFlip(axis: 'horizontal' | 'vertical') {
    if (selectedCells.size === 0) return;
    const { writes, newSelection } = flipSelection(selectedCells, dualGrid, axis);
    pushHistory();
    setDualGrid(prev => {
      const newMain = prev.main.map(row => row.slice());
      const newGap = prev.gap.map(row => row.slice());
      const gridFor = (pass: 'main' | 'gap') => (pass === 'main' ? newMain : newGap);
      writes.forEach((color, key) => {
        const [pass, rStr, cStr] = key.split(':') as ['main' | 'gap', string, string];
        const r = Number(rStr);
        const c = Number(cStr);
        const grid = gridFor(pass);
        if (grid[r] && grid[r][c] !== undefined) {
          grid[r][c] = color;
        }
      });
      return { main: newMain, gap: newGap };
    });
    setSelectedCells(newSelection);
  }
  function handleFlipHorizontal() { applyFlip('horizontal'); }
  function handleFlipVertical() { applyFlip('vertical'); }

  // Global find-and-replace across the whole pattern (both passes) - e.g.
  // "change black to blue" and "change blue to green" applied together.
  // Builds a single from->to lookup map up front, then does one pass over
  // the grid resolving each cell's *original* color through that map - this
  // is what makes simultaneous rules correct instead of chaining: a diamond
  // that started out red resolves directly to whatever "red" maps to, even
  // if "blue" (a different rule's target) is also somebody else's "from".
  // Invalid rules (blank colors, or from === to) are skipped. If the same
  // "from" color appears in more than one rule, the last one given wins -
  // the ColorsCard UI disables Apply All in that case rather than relying
  // on this fallback, but it's here as a safety net.
  function handleReplaceColors(rules: { from: string; to: string }[]) {
    const map = new Map<string, string>();
    for (const { from, to } of rules) {
      if (!from || !to || from === to) continue;
      map.set(from, to);
    }
    if (map.size === 0) return;
    pushHistory();
    setDualGrid(prev => ({
      main: prev.main.map(row => row.map(cell => (cell && map.has(cell) ? map.get(cell)! : cell))),
      gap:  prev.gap.map(row => row.map(cell => (cell && map.has(cell) ? map.get(cell)! : cell))),
    }));
  }

  function beginFloatingOp(kind: 'duplicate' | 'move') {
    if (selectedCells.size === 0) return;
    const cells: FloatingCell[] = [];
    selectedCells.forEach(key => {
      const [pass, rStr, cStr] = key.split(':') as ['main' | 'gap', string, string];
      const r = Number(rStr);
      const c = Number(cStr);
      const grid = pass === 'main' ? dualGrid.main : dualGrid.gap;
      const color = grid[r]?.[c] ?? null;
      cells.push({ pass, r, c, color });
    });

    const beforeSnapshot = snapshotGrid(dualGrid);

    // Move picks the diamonds up right away - their old spot goes blank
    // immediately, so what's on screen reads as "picked up and floating",
    // not "duplicated". Duplicate never touches the grid until Done.
    if (kind === 'move') {
      setDualGrid(prev => {
        const newMain = prev.main.map(row => row.slice());
        const newGap = prev.gap.map(row => row.slice());
        const gridFor = (pass: 'main' | 'gap') => (pass === 'main' ? newMain : newGap);
        for (const cell of cells) {
          const grid = gridFor(cell.pass);
          if (grid[cell.r] && grid[cell.r][cell.c] !== undefined) {
            grid[cell.r][cell.c] = null;
          }
        }
        return { main: newMain, gap: newGap };
      });
    }

    setFloatingOp({ kind, cells, dr: 0, dc: FLOATING_OP_DEFAULT_OFFSET, beforeSnapshot });

    // Duplicate deliberately keeps the selection (and this button) around,
    // so Duplicate can be clicked again right away for another copy of the
    // same diamonds without reselecting. Move relocates the selection, so
    // there's nothing meaningful left to keep selected at the old spot.
    if (kind === 'move') {
      setSelectedCells(new Set());
    }
  }

  function handleDuplicate() { beginFloatingOp('duplicate'); }
  function handleMove() { beginFloatingOp('move'); }

  function handleCancelFloating() {
    if (!floatingOp) return;
    if (floatingOp.kind === 'move') {
      setDualGrid(floatingOp.beforeSnapshot); // exact restore of the picked-up diamonds
    }
    setFloatingOp(null);
    grabAnchorRef.current = null;
  }

  // Commits the floating copy into the real pattern at wherever it's
  // currently offset to. Blank diamonds in the copy always leave whatever's
  // underneath them alone, rather than overwriting it as blank. Recorded as
  // a single Undo step covering the whole operation (including Move's
  // earlier pickup) via the beforeSnapshot captured in beginFloatingOp.
  function handleDoneFloating() {
    if (!floatingOp) return;

    setDualGrid(prev => {
      const newMain = prev.main.map(row => row.slice());
      const newGap = prev.gap.map(row => row.slice());
      const gridFor = (pass: 'main' | 'gap') => (pass === 'main' ? newMain : newGap);
      const boundsFor = (pass: 'main' | 'gap') =>
        pass === 'main'
          ? { rows: config.rows, cols: config.cols }
          : { rows: config.rows + 1, cols: config.cols + 1 };

      for (const cell of floatingOp.cells) {
        const destR = cell.r + floatingOp.dr;
        const destC = cell.c + floatingOp.dc;
        const { rows, cols } = boundsFor(cell.pass);
        if (destR < 0 || destR >= rows || destC < 0 || destC >= cols) continue; // dropped off-grid
        if (cell.color == null) continue; // blank diamonds never overwrite what's underneath
        const grid = gridFor(cell.pass);
        grid[destR][destC] = cell.color;
      }

      return { main: newMain, gap: newGap };
    });

    pushHistory(floatingOp.beforeSnapshot);
    setFloatingOp(null);
  }

  function handlePaletteChange(newPalette: (string | null)[], newColorCount: number) {
    setPalette(newPalette);
    onConfigChange({ ...config, palette: newPalette, colorCount: newColorCount, updatedAt: Date.now() });
  }

  function addRowTop() {
    pushHistory();
    const newMainRow = Array.from({ length: config.cols }, (): null => null);
    const newGapRow  = Array.from({ length: config.cols + 1 }, (): null => null);
    setDualGrid(prev => ({ main: [newMainRow, ...prev.main], gap: [newGapRow, ...prev.gap] }));
    onConfigChange({ ...config, rows: config.rows + 1, updatedAt: Date.now() });
  }

  function removeRowTop() {
    if (config.rows <= 1) return;
    pushHistory();
    setDualGrid(prev => ({ main: prev.main.slice(1), gap: prev.gap.slice(1) }));
    onConfigChange({ ...config, rows: config.rows - 1, updatedAt: Date.now() });
  }

  function addRowBottom() {
    pushHistory();
    const newMainRow = Array.from({ length: config.cols }, (): null => null);
    const newGapRow  = Array.from({ length: config.cols + 1 }, (): null => null);
    setDualGrid(prev => ({ main: [...prev.main, newMainRow], gap: [...prev.gap, newGapRow] }));
    onConfigChange({ ...config, rows: config.rows + 1, updatedAt: Date.now() });
  }

  function removeRowBottom() {
    if (config.rows <= 1) return;
    pushHistory();
    setDualGrid(prev => ({ main: prev.main.slice(0, -1), gap: prev.gap.slice(0, -1) }));
    onConfigChange({ ...config, rows: config.rows - 1, updatedAt: Date.now() });
  }

  function increaseLength() {
    pushHistory();
    setDualGrid(prev => ({
      main: prev.main.map(row => [...row, null]),
      gap:  prev.gap.map(row => [...row, null]),
    }));
    onConfigChange({ ...config, cols: config.cols + 1, updatedAt: Date.now() });
  }

  function decreaseLength() {
    if (config.cols <= 1) return;
    pushHistory();
    setDualGrid(prev => ({
      main: prev.main.map(row => row.slice(0, -1)),
      gap:  prev.gap.map(row => row.slice(0, -1)),
    }));
    onConfigChange({ ...config, cols: config.cols - 1, updatedAt: Date.now() });
  }

  function addColumnLeft() {
    pushHistory();
    setDualGrid(prev => ({
      main: prev.main.map(row => [null, ...row]),
      gap:  prev.gap.map(row => [null, ...row]),
    }));
    onConfigChange({ ...config, cols: config.cols + 1, updatedAt: Date.now() });
  }

  function removeColumnLeft() {
    if (config.cols <= 1) return;
    pushHistory();
    setDualGrid(prev => ({
      main: prev.main.map(row => row.slice(1)),
      gap:  prev.gap.map(row => row.slice(1)),
    }));
    onConfigChange({ ...config, cols: config.cols - 1, updatedAt: Date.now() });
  }

  function handleClear() {
    pushHistory();
    setDualGrid(createDualGrid(config.rows, config.cols));
    setSelectedCells(new Set());
    setFloatingOp(null);
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
    setSavedModalMode('ask');
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
    setSavedModalMode('ask');
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

  if (showColorPicker) {
    return (
      <ColorPickerScreen
        palette={palette}
        colorCount={config.colorCount}
        onStart={(newPalette, newColorCount) => {
          handlePaletteChange(newPalette, newColorCount);
          setShowColorPicker(false);
        }}
        onBack={() => setShowColorPicker(false)}
      />
    );
  }

  // Shared state for the extracted cardRow cards (ColorsCard, SelectorCard,
  // PatternToolCard, BehaviorControlsCard) - BuildScreen still owns all of
  // this state directly (it needs it for handleCellPress/Drag above), it
  // just also hands it down via context instead of individual props.
  const buildEditorValue: BuildEditorContextValue = {
    palette,
    colorCount: config.colorCount,
    selectedColorIdx,
    setSelectedColorIdx,
    onOpenColorPicker: () => setShowColorPicker(true),
    toolMode,
    onSelectTool: selectSelectTool,
    onColorTool: selectColorTool,
    onEraseTool: selectEraseTool,
    selectedCount: selectedCells.size,
    onReset: handleReset,
    onSelectConnected: handleSelectConnected,
    onSelectSameColor: handleSelectSameColor,
    floatingKind: floatingOp?.kind ?? null,
    onDuplicate: handleDuplicate,
    onMove: handleMove,
    onDoneFloating: handleDoneFloating,
    onCancelFloating: handleCancelFloating,
    onRecolorSelection: handleRecolorSelection,
    onFlipHorizontal: handleFlipHorizontal,
    onFlipVertical: handleFlipVertical,
    onReplaceColors: handleReplaceColors,
  };

  // Floating copy shifted to its current on-screen position, for
  // PatternGridView to render - kept null when there's nothing floating so
  // the grid doesn't do the map for nothing.
  const floatingCellsForGrid: FloatingCell[] | null = floatingOp
    ? floatingOp.cells.map(cell => ({
        pass:  cell.pass,
        r:     cell.r + floatingOp.dr,
        c:     cell.c + floatingOp.dc,
        color: cell.color,
      }))
    : null;

  // Header as a separate component so stickyHeaderIndices can reference it
  const header = (
    <View style={s.header}>
      <View style={s.headerTopRow}>
        <View style={s.titleRowLeft}>
          <input
            type="text"
            value={name}
            onChange={e => {
              const newName = e.target.value;
              setName(newName);
              onConfigChange({ ...config, name: newName });
            }}
            style={titleInputStyle}
          />

          {nameStatus === 'taken' && (
            <Text style={s.nameTakenTxt}>Name already used</Text>
          )}

          <TouchableOpacity
            style={[s.toolbarBtn, s.orientationBtn]}
            onPress={() => setOrientation(o => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
          >
            <Text style={s.toolbarBtnTxt}>
              {orientation === 'horizontal' ? 'Show Vertical' : 'Show Horizontal'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.toolbarBtn}
            onPress={handleFitToWindow}
          >
            <Text style={s.toolbarBtnTxt}>Fit to Window</Text>
          </TouchableOpacity>

          <View style={s.zoomRow}>
            <TouchableOpacity
              style={[s.zoomBtn, zoomIdx <= 0 && manualZoomOverride == null && s.zoomBtnDisabled]}
              onPress={stepZoomDown}
            >
              <Text style={s.zoomBtnTxt}>-</Text>
            </TouchableOpacity>
            <Text style={s.zoomLabel}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity
              style={[s.zoomBtn, zoomIdx >= ZOOM_LEVELS.length - 1 && manualZoomOverride == null && s.zoomBtnDisabled]}
              onPress={stepZoomUp}
            >
              <Text style={s.zoomBtnTxt}>+</Text>
            </TouchableOpacity>
          </View>

          <ModeIndicator />
        </View>

        <View style={s.headerRightGroup}>
          <TouchableOpacity style={s.toolbarBtn} onPress={() => setShowStartOverConfirm(true)}>
            <Text style={s.toolbarBtnTxt}>Start Over</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={handleUndo}>
            <Text style={s.toolbarBtnTxt}>Undo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={handleRedo}>
            <Text style={s.toolbarBtnTxt}>Redo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={handleClear}>
            <Text style={s.toolbarBtnTxt}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={openSaveAsNew}>
            <Text style={s.toolbarBtnTxt}>Save As New</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.toolbarBtn,
              s.saveBtn,
              (isSavingCloud || nameStatus === 'taken' || nameStatus === 'checking') && s.toolbarBtnDisabled,
            ]}
            onPress={handleSavePress}
            disabled={isSavingCloud || nameStatus === 'taken' || nameStatus === 'checking'}
          >
            <Text style={s.saveBtnTxt}>{isSavingCloud ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toolbarBtn, isDeleting && s.toolbarBtnDisabled]}
            onPress={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
          >
            <Text style={s.toolbarBtnTxt}>{isDeleting ? 'Deleting...' : 'Delete'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Lives beside the grid, not above it - collapsible via sidebarCollapsed.
  // Deliberately left as its own inline block rather than folded into the
  // new build-cards system: it duplicates some of what the cards do
  // (colors, rectangle selector tools), which is a known, flagged-for-later
  // consolidation once vertical mode gets its own redesign pass.
  const sidebar = (
    <View style={s.sidebar}>
      <View style={s.sidebarHeaderRow}>
        <Text style={s.groupLabel}>DESIGN CONTROLS</Text>
        <TouchableOpacity
          style={s.sidebarCollapseBtn}
          onPress={() => setSidebarCollapsed(true)}
          title="Hide these controls to see more of your bracelet."
        >
          <Text style={s.sidebarCollapseBtnTxt}>{'▶'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.colorsRow}>
        {palette.slice(0, config.colorCount).map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[
              s.circleBtn,
              {
                backgroundColor: c ?? theme.border,
                borderWidth:     selectedColorIdx === i ? 3 : 1.5,
                borderColor:     selectedColorIdx === i ? theme.purple : (c ?? theme.swatchBorder),
              },
            ]}
            onPress={() => { if (c) setSelectedColorIdx(i); }}
          />
        ))}
        <TouchableOpacity style={s.changeColorsBtn} onPress={() => setShowColorPicker(true)}>
          <Text style={s.changeColorsBtnTxt}>Change Colors</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.toolbarBtn, s.selectorStandaloneBtn, toolMode === 'paint' && s.toolbarBtnActive]}
        onPress={selectColorTool}
      >
        <Text style={[s.toolbarBtnTxt, toolMode === 'paint' && s.toolbarBtnActiveTxt]}>Color Tool</Text>
      </TouchableOpacity>

      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'selector' && s.tabBtnActive]}
          onPress={() => setActiveTab(t => (t === 'selector' ? null : 'selector'))}
        >
          <Text style={[s.tabBtnTxt, activeTab === 'selector' && s.tabBtnActiveTxt]}>Selector</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'pattern-tool' && s.tabBtnActive]}
          onPress={() => setActiveTab(t => (t === 'pattern-tool' ? null : 'pattern-tool'))}
        >
          <Text style={[s.tabBtnTxt, activeTab === 'pattern-tool' && s.tabBtnActiveTxt]}>Pattern Tool</Text>
        </TouchableOpacity>
      </View>

      {activeTab && (
        <View style={s.tabPanel}>
          {activeTab === 'selector' && (
            <View style={s.sectionToolsRow}>
              {floatingOp ? (
                <>
                  <TouchableOpacity style={s.toolbarBtn} onPress={handleCancelFloating}>
                    <Text style={s.toolbarBtnTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.toolbarBtn, s.toolbarBtnActive]} onPress={handleDoneFloating}>
                    <Text style={[s.toolbarBtnTxt, s.toolbarBtnActiveTxt]}>Done</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[s.toolbarBtn, toolMode === 'select' && s.toolbarBtnActive]}
                    onPress={selectSelectTool}
                    title="Turn this on, then click or drag across the diamonds you want to grab - just like coloring."
                  >
                    <Text style={[s.toolbarBtnTxt, toolMode === 'select' && s.toolbarBtnActiveTxt]}>
                      Select Tool
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.toolbarBtn, selectedCells.size === 0 && s.toolbarBtnDisabled]}
                    onPress={handleReset}
                    disabled={selectedCells.size === 0}
                    title="Clears the current selection so you can start a new one."
                  >
                    <Text style={[s.toolbarBtnTxt, selectedCells.size === 0 && s.toolbarBtnDisabledTxt]}>Reset</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.toolbarBtn, selectedCells.size === 0 && s.toolbarBtnDisabled]}
                    onPress={handleDuplicate}
                    disabled={selectedCells.size === 0}
                    title="Makes a movable copy of your selection. Stays available so you can stamp another copy right after."
                  >
                    <Text style={[s.toolbarBtnTxt, selectedCells.size === 0 && s.toolbarBtnDisabledTxt]}>Duplicate</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.toolbarBtn, selectedCells.size === 0 && s.toolbarBtnDisabled]}
                    onPress={handleMove}
                    disabled={selectedCells.size === 0}
                    title="Picks up your selection so you can move it - the old spot goes blank right away."
                  >
                    <Text style={[s.toolbarBtnTxt, selectedCells.size === 0 && s.toolbarBtnDisabledTxt]}>Move</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {activeTab === 'pattern-tool' && (
            <Text style={s.comingSoonTxt}>
              Not built yet - this section is a placeholder until we decide what
              goes here.
            </Text>
          )}
        </View>
      )}
    </View>
  );

  const collapsedSidebarToggle = (
    <View style={s.sidebarCollapsedStrip}>
      <TouchableOpacity
        style={s.sidebarExpandBtn}
        onPress={() => setSidebarCollapsed(false)}
        title="Show design controls (colors, sizing, selection tools)"
      >
        <Text style={s.sidebarExpandBtnTxt}>{'◀'}</Text>
      </TouchableOpacity>

      <View style={s.collapsedColorsCol}>
        {palette.slice(0, config.colorCount).map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[
              s.collapsedCircleBtn,
              {
                backgroundColor: c ?? theme.border,
                borderWidth:     selectedColorIdx === i ? 3 : 1.5,
                borderColor:     selectedColorIdx === i ? theme.purple : (c ?? theme.swatchBorder),
              },
            ]}
            onPress={() => { if (c) setSelectedColorIdx(i); }}
          />
        ))}
      </View>
    </View>
  );

  const cardRow = (
    <View
      ref={cardRowRef}
      style={[s.cardRowOuter, { minHeight: cardRowMinHeight }]}
      onLayout={() => {
        cardRowRef.current?.measureInWindow((x, y) => setCardRowTop(y));
      }}
    >
      <View style={s.cardRow}>
        <ColorsCard />
        <SelectorCard />
        <PatternToolCard />
        <BehaviorControlsCard />
      </View>
    </View>
  );

  return (
    <BuildEditorContext.Provider value={buildEditorValue}>
      <>
        <ScrollView
          style={s.screen}
          contentContainerStyle={s.content}
          stickyHeaderIndices={[0]}
        >
          {header}

          <View style={orientation === 'horizontal' ? s.bodyColumn : s.bodyRow}>
            <View style={s.gridArea} onLayout={e => setGridViewportWidth(e.nativeEvent.layout.width)}>
              <GridEdgeControls
                axis="row"
                onDecrease={removeRowTop}
                onIncrease={addRowTop}
                decreaseTitle="Remove the top row"
                increaseTitle="Add a row to the top"
              />

              <View style={s.gridWithSideEdges}>
                <GridEdgeControls
                  axis="column"
                  onDecrease={removeColumnLeft}
                  onIncrease={addColumnLeft}
                  decreaseTitle="Remove a column from the left"
                  increaseTitle="Add a column to the left"
                />

                <View style={s.gridScrollWrapper}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator
                    style={s.gridScroll}
                    contentContainerStyle={[
                      s.gridContent,
                      orientation === 'vertical' && s.gridContentCentered,
                    ]}
                  >
                    <PatternGridView
                      dualGrid={dualGrid}
                      orientation={orientation}
                      onCellPress={handleCellPress}
                      onCellDrag={handleCellDrag}
                      onCellRelease={handleCellRelease}
                      zoom={zoom}
                      selectedCells={selectedCells}
                      floatingCells={floatingCellsForGrid}
                      boxSelectEnabled={toolMode === 'select' && !floatingOp}
                      onBoxSelect={handleBoxSelect}
                    />
                  </ScrollView>
                </View>

                <GridEdgeControls
                  axis="column"
                  onDecrease={decreaseLength}
                  onIncrease={increaseLength}
                  decreaseTitle="Remove a column from the right"
                  increaseTitle="Add a column to the right"
                />
              </View>

              <GridEdgeControls
                axis="row"
                onDecrease={removeRowBottom}
                onIncrease={addRowBottom}
                decreaseTitle="Remove the bottom row"
                increaseTitle="Add a row to the bottom"
              />
            </View>

            {orientation === 'horizontal'
              ? cardRow
              : (sidebarCollapsed ? collapsedSidebarToggle : sidebar)}
          </View>
        </ScrollView>

        <StartOverConfirmModal
          visible={showStartOverConfirm}
          onCancel={() => setShowStartOverConfirm(false)}
          onConfirm={() => {
            setShowStartOverConfirm(false);
            storageRemove(STORAGE_KEYS.patternState(config.id));
            onExit();
          }}
        />

        <DeletePatternModal
          visible={showDeleteConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeletePattern}
        />

        <AccountRequiredModal
          visible={showAccountRequiredModal}
          onCancel={() => setShowAccountRequiredModal(false)}
          onConfirm={() => {
            setShowAccountRequiredModal(false);
            onRequireAccount();
          }}
        />

        <SaveAsNewModal
          visible={showSaveAsNewModal}
          name={saveAsNewName}
          nameStatus={saveAsNewNameStatus}
          onChangeName={setSaveAsNewName}
          onCancel={() => setShowSaveAsNewModal(false)}
          onConfirm={handleSaveAsNew}
        />

        <SavedModal
          visible={showSavedModal}
          mode={savedModalMode}
          cloudSaveError={cloudSaveError}
          onNotNow={() => setShowSavedModal(false)}
          onBuildIt={() => setSavedModalMode('coming-soon')}
          onGotIt={() => setShowSavedModal(false)}
        />
      </>
    </BuildEditorContext.Provider>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen:             { flex: 1, backgroundColor: theme.background },
    content:            { flexGrow: 1 },
    header:             { backgroundColor: theme.surface, paddingHorizontal: 40, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
    headerTopRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    titleRowLeft:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    nameTakenTxt:       { fontSize: 11, fontWeight: '600', color: theme.danger },
    headerRightGroup:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
    colorsRow:          { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    selectorStandaloneBtn: { alignSelf: 'flex-start' },
    circleBtn:          { width: 28, height: 28, borderRadius: 14 },
    changeColorsBtn:    { borderWidth: 1, borderColor: theme.purple, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.purpleTint },
    changeColorsBtnTxt: { fontSize: 12, fontWeight: '600', color: theme.purple },
    groupLabel:         { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: theme.textFaint, marginRight: 4 },
    tabBar:             { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    tabBtn:             { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: theme.surfaceMutedAlt, borderWidth: 1, borderColor: theme.border },
    tabBtnActive:       { backgroundColor: theme.purpleTint, borderColor: theme.purple },
    tabBtnTxt:          { fontSize: 13, fontWeight: '700', color: theme.textMuted },
    tabBtnActiveTxt:    { color: theme.purple },
    tabPanel:           { paddingTop: 12, paddingHorizontal: 4, gap: 12, borderTopWidth: 1, borderTopColor: theme.border, marginTop: 8 },
    sectionToolsRow:    { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    comingSoonTxt:      { fontSize: 12, color: theme.textFaint, fontStyle: 'italic' },
    bodyRow:            { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
    bodyColumn:         { flexDirection: 'column', flex: 1 },
    cardRowOuter:       { flex: 1, backgroundColor: theme.panelBackground, paddingVertical: 18, paddingHorizontal: 24 },
    cardRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    gridArea:           { flex: 1, alignItems: 'center', paddingVertical: 16, backgroundColor: theme.surface },
    gridWithSideEdges:  { flexDirection: 'row', alignItems: 'center' },
    sidebar:            { width: 240, borderLeftWidth: 1, borderLeftColor: theme.border, paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
    sidebarHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sidebarCollapseBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: theme.purpleTint },
    sidebarCollapseBtnTxt: { fontSize: 11, color: theme.purple, fontWeight: '700' },
    sidebarExpandBtn:   { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: theme.purpleTint },
    sidebarExpandBtnTxt: { fontSize: 11, color: theme.purple, fontWeight: '700' },
    sidebarCollapsedStrip: { width: 44, borderLeftWidth: 1, borderLeftColor: theme.border, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 14 },
    collapsedColorsCol: { flexDirection: 'column', gap: 6, alignItems: 'center' },
    collapsedCircleBtn: { width: 22, height: 22, borderRadius: 11 },
    toolbarBtn:         { borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.surfaceMuted },
    orientationBtn:     { minWidth: 132, alignItems: 'center' },
    toolbarBtnActive:   { backgroundColor: theme.purpleTint, borderColor: theme.purple },
    toolbarBtnActiveTxt:{ color: theme.purple },
    toolbarBtnDisabled: { opacity: 0.4 },
    toolbarBtnDisabledTxt: { color: theme.textFaint },
    toolbarBtnTxt:      { fontSize: 12, fontWeight: '600', color: theme.textMuted },
    saveBtn:            { backgroundColor: theme.purple, borderColor: theme.purple },
    saveBtnTxt:         { fontSize: 12, fontWeight: '700', color: theme.textOnPurple },
    zoomRow:            { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.border, borderRadius: 8, overflow: 'hidden' },
    zoomBtn:            { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surfaceMutedAlt },
    zoomBtnDisabled:    { opacity: 0.35 },
    zoomBtnTxt:         { fontSize: 18, color: theme.textMuted },
    zoomLabel:          { width: 48, textAlign: 'center', fontSize: 12, fontWeight: '600', color: theme.textMuted },
    gridScrollWrapper:  { flexShrink: 1, minWidth: 0 },
    gridScroll:         { flexShrink: 1 },
    gridContent:        {},
    gridContentCentered:{ minWidth: '100%', justifyContent: 'center' },
  });
}
