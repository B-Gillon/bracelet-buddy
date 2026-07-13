import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import Svg, { Rect, Polygon } from 'react-native-svg';
import { PatternConfig, PatternGrid, DualGrid, DEFAULT_PATTERN_NAME, createEmptyGrid } from '../types/pattern';
import ColorPickerScreen from './ColorPickerScreen';
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import { savePattern, formatPatternNumber } from '../utils/patterns';
import { CellInfo, buildCells } from '../utils/diamondGrid';

const EMPTY_FILL = '#f0efeb';
const STROKE     = '#c8c6bc';
const BORDER     = '#b0aea4';
const PURPLE     = '#7c3aed';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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

const saveAsNewInputStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  height: 40,
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  backgroundColor: '#fff',
  paddingLeft: 12,
  paddingRight: 12,
  fontSize: 14,
  color: '#111',
  width: '100%',
  marginTop: 4,
  marginBottom: 4,
};

function createDualGrid(mainRows: number, mainCols: number): DualGrid {
  return {
    main: createEmptyGrid(mainCols, mainRows),
    gap:  createEmptyGrid(mainCols + 1, mainRows + 1),
  };
}

function PatternGridView({
  dualGrid, orientation, onCellPress, onCellDrag, zoom, selRange, pasteMode, clipboardWidth,
}: {
  dualGrid:       DualGrid;
  orientation:    'horizontal' | 'vertical';
  onCellPress:    (pass: 'main' | 'gap', r: number, c: number) => void;
  onCellDrag:     (pass: 'main' | 'gap', r: number, c: number) => void;
  zoom:           number;
  selRange?:      { lo: number; hi: number } | null;
  pasteMode?:     boolean;
  clipboardWidth?: number | null;
}) {
  const BASE = 40;
  const D    = BASE * zoom;
  const H    = D / 2;

  const mainRows = dualGrid.main.length;
  const mainCols = mainRows > 0 ? dualGrid.main[0].length : 0;

  const displayMainRows = orientation === 'horizontal' ? mainRows : mainCols;
  const displayMainCols = orientation === 'horizontal' ? mainCols : mainRows;

  const svgWidth  = displayMainCols * D;
  const svgHeight = displayMainRows * D;

  const cells = buildCells(displayMainRows, displayMainCols, D);

  const containerRef = useRef<View>(null);
  const offsetRef    = useRef({ x: 0, y: 0 });
  const lastCellRef  = useRef<string | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);

  function resolveCell(cell: CellInfo): { r: number; c: number } {
    if (orientation === 'horizontal') {
      return { r: cell.gr, c: cell.gc };
    } else {
      if (cell.pass === 'main') {
        const maxDisplayCol = displayMainCols - 1;
        return { r: maxDisplayCol - cell.gc, c: cell.gr };
      } else {
        const maxGapDisplayCol = displayMainCols;
        return { r: maxGapDisplayCol - cell.gc, c: cell.gr };
      }
    }
  }

  function getCellColor(cell: CellInfo): string | null {
    const { r, c } = resolveCell(cell);
    const grid = cell.pass === 'main' ? dualGrid.main : dualGrid.gap;
    if (!grid[r] || grid[r][c] === undefined) return null;
    return grid[r][c];
  }

  function findCell(pageX: number, pageY: number): CellInfo | null {
    const rawX = pageX - offsetRef.current.x;
    const rawY = pageY - offsetRef.current.y;

    let best: CellInfo | null = null;
    let bestDist = Infinity;

    for (const cell of cells) {
      const dist = Math.abs(rawX - cell.cx) + Math.abs(rawY - cell.cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }

    return (best && bestDist <= H) ? best : null;
  }

  function handlePress(evt: any) {
    const pageX = evt.nativeEvent.pageX;
    const pageY = evt.nativeEvent.pageY;
    // Re-measure right now rather than trusting onLayout's cached position -
    // on web, that measurement doesn't reliably refire just because a
    // sibling above (the header) changed height and pushed this view down,
    // only when this view's own size changes. A stale offset here is
    // exactly what causes clicks to land on the wrong row.
    containerRef.current?.measureInWindow((x, y) => {
      offsetRef.current = { x, y };
      const cell = findCell(pageX, pageY);
      if (!cell) return;
      lastCellRef.current = cell.key;
      const { r, c } = resolveCell(cell);
      onCellPress(cell.pass, r, c);
    });
  }

  function handleMove(evt: any) {
    const cell = findCell(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    if (!cell) return;
    if (cell.key === lastCellRef.current) return;
    lastCellRef.current = cell.key;
    const { r, c } = resolveCell(cell);
    onCellDrag(cell.pass, r, c);
  }

  // Plain browser mouse tracking (not the touch/drag responder system
  // above), since this needs to fire on pure hover with no click held -
  // that's what makes a live paste-destination preview possible.
  function handleHoverMove(evt: any) {
    if (!pasteMode) return;
    const cell = findCell(evt.pageX, evt.pageY);
    if (!cell || cell.pass !== 'main') return;
    const { c } = resolveCell(cell);
    setHoverCol(c);
  }
  function handleHoverLeave() {
    setHoverCol(null);
  }

  // A logical "column" (from selRange, always in dualGrid.main's own
  // coordinate space) maps to a horizontal band in horizontal orientation,
  // but to a vertical band of display rows in vertical orientation - since
  // resolveCell() swaps rows/cols for that mode. This mirrors that same
  // swap for the selection overlay.
  const selectionRect = selRange
    ? orientation === 'horizontal'
      ? { x: selRange.lo * D, y: 0, width: (selRange.hi - selRange.lo + 1) * D, height: svgHeight }
      : { x: 0, y: selRange.lo * D, width: svgWidth, height: (selRange.hi - selRange.lo + 1) * D }
    : null;

  // Shows exactly where a paste would land, following the cursor - same
  // orientation-aware column-to-band mapping as the selection rect above.
  const previewRect = (pasteMode && clipboardWidth && hoverCol != null)
    ? orientation === 'horizontal'
      ? { x: hoverCol * D, y: 0, width: clipboardWidth * D, height: svgHeight }
      : { x: 0, y: hoverCol * D, width: svgWidth, height: clipboardWidth * D }
    : null;

  return (
    <View
      ref={containerRef}
      onLayout={() => {
        containerRef.current?.measureInWindow((x, y) => {
          offsetRef.current = { x, y };
        });
      }}
    >
      <Svg width={svgWidth} height={svgHeight}>
        {cells.map(cell => (
          <Polygon
            key={'bg-' + cell.key}
            points={cell.points}
            fill={EMPTY_FILL}
            stroke={STROKE}
            strokeWidth={0.75}
          />
        ))}
        {cells.map(cell => {
          const color = getCellColor(cell);
          if (!color) return null;
          return (
            <Polygon
              key={'fg-' + cell.key}
              points={cell.points}
              fill={color}
              stroke={STROKE}
              strokeWidth={0.75}
            />
          );
        })}
        <Rect
          x={0} y={0}
          width={svgWidth} height={svgHeight}
          rx={6}
          fill="none"
          stroke={BORDER}
          strokeWidth={1.25}
        />
        {selectionRect && (
          <Rect
            x={selectionRect.x + 2}
            y={selectionRect.y + 2}
            width={selectionRect.width - 4}
            height={selectionRect.height - 4}
            fill="none"
            stroke={PURPLE}
            strokeWidth={3}
          />
        )}
        {previewRect && (
          <Rect
            x={previewRect.x + 2}
            y={previewRect.y + 2}
            width={previewRect.width - 4}
            height={previewRect.height - 4}
            fill="rgba(124,58,237,0.18)"
            stroke={PURPLE}
            strokeWidth={2}
            strokeDasharray="6,4"
          />
        )}
      </Svg>

      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handlePress}
        onResponderMove={handleMove}
        onResponderRelease={() => { lastCellRef.current = null; }}
        {...({ onMouseMove: handleHoverMove, onMouseLeave: handleHoverLeave } as any)}
      />
    </View>
  );
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

  const [name, setName]                         = useState(config.name);
  const [dualGrid, setDualGrid]                 = useState<DualGrid>(() => createDualGrid(config.rows, config.cols));
  const [palette, setPalette]                   = useState<(string | null)[]>(config.palette);
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [orientation, setOrientation]           = useState<'horizontal' | 'vertical'>('horizontal');
  const [zoomIdx, setZoomIdx]                   = useState(2);
  const [showColorPicker, setShowColorPicker]   = useState(false);
  const [manualZoomOverride, setManualZoomOverride] = useState<number | null>(null);
  const [gridViewportWidth, setGridViewportWidth] = useState(0);
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const [showAccountRequiredModal, setShowAccountRequiredModal] = useState(false);
  const [showSaveAsNewModal, setShowSaveAsNewModal] = useState(false);
  const [saveAsNewName, setSaveAsNewName]       = useState('');
  const [showSavedModal, setShowSavedModal]     = useState(false);
  const [savedModalMode, setSavedModalMode]     = useState<'ask' | 'coming-soon'>('ask');
  const [isSavingCloud, setIsSavingCloud]       = useState(false);
  const [cloudSaveError, setCloudSaveError]     = useState<string | null>(null);
  const [hydrated, setHydrated]                 = useState(false);
  const saveTimeoutRef                          = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toolMode, setToolMode]                 = useState<'paint' | 'select'>('paint');
  const [activeTab, setActiveTab] = useState<'rectangle' | 'freeform' | 'pattern-tool' | null>(null);
  const [selectorMode, setSelectorMode] = useState<'rectangle' | 'freeform'>('rectangle');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selRange, setSelRange]                 = useState<{ lo: number; hi: number } | null>(null);
  const [clipboard, setClipboard]               = useState<{ main: PatternGrid; gap: PatternGrid; width: number } | null>(null);
  const [pasteMode, setPasteMode]                = useState(false);
  const selectAnchorRef                          = useRef<number | null>(null);
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

  function pushHistory() {
    historyRef.current.push({
      main: dualGrid.main.map(row => row.slice()),
      gap:  dualGrid.gap.map(row => row.slice()),
    });
    if (historyRef.current.length > 20) historyRef.current.shift();
  }

  function handleUndo() {
    const prev = historyRef.current.pop();
    if (prev) setDualGrid(prev);
  }

  function handleCellPress(pass: 'main' | 'gap', r: number, c: number) {
    if (pasteMode) {
      if (pass !== 'main') return;
      performPaste(c);
      return;
    }
    if (toolMode === 'select') {
      if (pass !== 'main') return;
      selectAnchorRef.current = c;
      setSelRange({ lo: c, hi: c });
      return;
    }
    const color = palette[selectedColorIdx];
    if (!color) return;
    setDualGrid(prev => {
      const grid = (pass === 'main' ? prev.main : prev.gap).map(row => row.slice());
      if (!grid[r] || grid[r][c] === undefined) return prev;
      grid[r][c] = grid[r][c] === color ? null : color;
      return pass === 'main' ? { ...prev, main: grid } : { ...prev, gap: grid };
    });
  }

  function handleCellDrag(pass: 'main' | 'gap', r: number, c: number) {
    if (pasteMode) return; // paste only triggers on a single press, not a drag
    if (toolMode === 'select') {
      if (pass !== 'main' || selectAnchorRef.current == null) return;
      const anchor = selectAnchorRef.current;
      setSelRange({ lo: Math.min(anchor, c), hi: Math.max(anchor, c) });
      return;
    }
    const color = palette[selectedColorIdx];
    if (!color) return;
    setDualGrid(prev => {
      const grid = (pass === 'main' ? prev.main : prev.gap).map(row => row.slice());
      if (!grid[r] || grid[r][c] === undefined) return prev;
      if (grid[r][c] === color) return prev;
      grid[r][c] = color;
      return pass === 'main' ? { ...prev, main: grid } : { ...prev, gap: grid };
    });
  }

  function toggleSelectMode() {
    setToolMode(m => (m === 'select' ? 'paint' : 'select'));
    setPasteMode(false);
    setSelRange(null);
    selectAnchorRef.current = null;
  }

  function handleCopySelection() {
    if (!selRange) return;
    const { lo, hi } = selRange;
    // Edge-inclusive on purpose: grabbing the full width, boundary diamonds
    // included, is what lets two placed copies agree on their shared
    // border instead of leaving gaps at the seam.
    const main: PatternGrid = dualGrid.main.map(row => row.slice(lo, hi + 1));
    const gap: PatternGrid = dualGrid.gap.map(row => row.slice(lo, hi + 2));
    setClipboard({ main, gap, width: hi - lo + 1 });
  }

  function toggleStampMode() {
    if (!clipboard) return;
    setPasteMode(m => !m);
  }

  function performPaste(destCol: number) {
    if (!clipboard) return;
    pushHistory();
    const width = clipboard.width;
    setDualGrid(prev => {
      const newMain = prev.main.map(row => row.slice());
      const newGap = prev.gap.map(row => row.slice());
      for (let j = 0; j < width && (destCol + j) < config.cols; j++) {
        for (let r = 0; r < newMain.length; r++) {
          newMain[r][destCol + j] = clipboard.main[r][j];
        }
      }
      for (let j = 0; j <= width && (destCol + j) <= config.cols; j++) {
        for (let r = 0; r < newGap.length; r++) {
          newGap[r][destCol + j] = clipboard.gap[r][j];
        }
      }
      return { main: newMain, gap: newGap };
    });
    // Deliberately stays in paste mode - "stamp" repeatedly until the user
    // turns it off themselves, rather than exiting after one placement.
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
        </View>

        <View style={s.headerRightGroup}>
          <TouchableOpacity style={s.toolbarBtn} onPress={() => setShowStartOverConfirm(true)}>
            <Text style={s.toolbarBtnTxt}>Start Over</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={handleUndo}>
            <Text style={s.toolbarBtnTxt}>Undo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={handleClear}>
            <Text style={s.toolbarBtnTxt}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={openSaveAsNew}>
            <Text style={s.toolbarBtnTxt}>Save As New</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toolbarBtn, s.saveBtn, isSavingCloud && s.toolbarBtnDisabled]}
            onPress={handleSavePress}
            disabled={isSavingCloud}
          >
            <Text style={s.saveBtnTxt}>{isSavingCloud ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Lives beside the grid, not above it - collapsible via sidebarCollapsed.
  const sidebar = (
    <View style={s.sidebar}>
      <View style={s.sidebarHeaderRow}>
        <Text style={s.groupLabel}>DESIGN CONTROLS</Text>
        <TouchableOpacity
          style={s.sidebarCollapseBtn}
          onPress={() => setSidebarCollapsed(true)}
          title="Hide these controls to see more of your bracelet."
        >
          <Text style={s.sidebarCollapseBtnTxt}>{'\u25B6'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.colorsRow}>
        {palette.slice(0, config.colorCount).map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[
              s.circleBtn,
              {
                backgroundColor: c ?? '#e5e7eb',
                borderWidth:     selectedColorIdx === i ? 3 : 1.5,
                borderColor:     selectedColorIdx === i ? PURPLE : (c ?? '#d1d5db'),
              },
            ]}
            onPress={() => { if (c) setSelectedColorIdx(i); }}
          />
        ))}
        <TouchableOpacity style={s.changeColorsBtn} onPress={() => setShowColorPicker(true)}>
          <Text style={s.changeColorsBtnTxt}>Change Colors</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabBar}>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'rectangle' && s.tabBtnActive]}
          onPress={() => setActiveTab(t => (t === 'rectangle' ? null : 'rectangle'))}
        >
          <Text style={[s.tabBtnTxt, activeTab === 'rectangle' && s.tabBtnActiveTxt]}>Rectangle Selector</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, activeTab === 'freeform' && s.tabBtnActive]}
          onPress={() => setActiveTab(t => (t === 'freeform' ? null : 'freeform'))}
        >
          <Text style={[s.tabBtnTxt, activeTab === 'freeform' && s.tabBtnActiveTxt]}>Freeform Selector</Text>
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
          {activeTab === 'rectangle' && (
            <View style={s.sectionToolsRow}>
              <TouchableOpacity
                style={[s.toolbarBtn, toolMode === 'select' && s.toolbarBtnActive]}
                onPress={toggleSelectMode}
                title="Turn this on, then drag across the diamonds you want to grab!"
              >
                <Text style={[s.toolbarBtnTxt, toolMode === 'select' && s.toolbarBtnActiveTxt]}>
                  {toolMode === 'select' ? 'Selecting: On' : 'Select'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.toolbarBtn, !selRange && s.toolbarBtnDisabled]}
                onPress={handleCopySelection}
                disabled={!selRange}
                title="Grabs everything inside your selection so you can use it again."
              >
                <Text style={[s.toolbarBtnTxt, !selRange && s.toolbarBtnDisabledTxt]}>Copy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.toolbarBtn, pasteMode && s.toolbarBtnActive, !clipboard && s.toolbarBtnDisabled]}
                onPress={toggleStampMode}
                disabled={!clipboard}
                title="Turns on stamping - every diamond you click gets your copy placed there, again and again, until you turn it off."
              >
                <Text style={[s.toolbarBtnTxt, pasteMode && s.toolbarBtnActiveTxt, !clipboard && s.toolbarBtnDisabledTxt]}>
                  {pasteMode ? 'Stamping: On' : 'Paste'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'freeform' && (
            <Text style={s.comingSoonTxt}>
              Coming soon! This will let you click individual diamonds to select an
              irregular shape (like a chevron), then copy and paste it.
            </Text>
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
        <Text style={s.sidebarExpandBtnTxt}>{'\u25C0'}</Text>
      </TouchableOpacity>

      <View style={s.collapsedColorsCol}>
        {palette.slice(0, config.colorCount).map((c, i) => (
          <TouchableOpacity
            key={i}
            style={[
              s.collapsedCircleBtn,
              {
                backgroundColor: c ?? '#e5e7eb',
                borderWidth:     selectedColorIdx === i ? 3 : 1.5,
                borderColor:     selectedColorIdx === i ? PURPLE : (c ?? '#d1d5db'),
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
        <View style={s.card}>
          <Text style={s.cardLabel}>COLORS</Text>
          <View style={s.colorsRow}>
            {palette.slice(0, config.colorCount).map((c, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.circleBtn,
                  {
                    backgroundColor: c ?? '#e5e7eb',
                    borderWidth:     selectedColorIdx === i ? 3 : 1.5,
                    borderColor:     selectedColorIdx === i ? PURPLE : (c ?? '#d1d5db'),
                  },
                ]}
                onPress={() => { if (c) setSelectedColorIdx(i); }}
              />
            ))}
          </View>
          <TouchableOpacity style={s.changeColorsBtn} onPress={() => setShowColorPicker(true)}>
            <Text style={s.changeColorsBtnTxt}>Change Colors</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>SELECTOR</Text>
          <View style={s.selectorModeToggle}>
            <TouchableOpacity
              style={[s.selectorModeBtn, selectorMode === 'rectangle' && s.selectorModeBtnActive]}
              onPress={() => setSelectorMode('rectangle')}
            >
              <Text style={[s.selectorModeBtnTxt, selectorMode === 'rectangle' && s.selectorModeBtnActiveTxt]}>Rectangle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.selectorModeBtn, selectorMode === 'freeform' && s.selectorModeBtnActive]}
              onPress={() => setSelectorMode('freeform')}
            >
              <Text style={[s.selectorModeBtnTxt, selectorMode === 'freeform' && s.selectorModeBtnActiveTxt]}>Freeform</Text>
            </TouchableOpacity>
          </View>

          {selectorMode === 'rectangle' ? (
            <View style={s.sectionToolsRow}>
              <TouchableOpacity
                style={[s.toolbarBtn, toolMode === 'select' && s.toolbarBtnActive]}
                onPress={toggleSelectMode}
                title="Turn this on, then drag across the diamonds you want to grab!"
              >
                <Text style={[s.toolbarBtnTxt, toolMode === 'select' && s.toolbarBtnActiveTxt]}>
                  {toolMode === 'select' ? 'Selecting: On' : 'Select'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.toolbarBtn, !selRange && s.toolbarBtnDisabled]}
                onPress={handleCopySelection}
                disabled={!selRange}
                title="Grabs everything inside your selection so you can use it again."
              >
                <Text style={[s.toolbarBtnTxt, !selRange && s.toolbarBtnDisabledTxt]}>Copy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.toolbarBtn, pasteMode && s.toolbarBtnActive, !clipboard && s.toolbarBtnDisabled]}
                onPress={toggleStampMode}
                disabled={!clipboard}
                title="Turns on stamping - every diamond you click gets your copy placed there, again and again, until you turn it off."
              >
                <Text style={[s.toolbarBtnTxt, pasteMode && s.toolbarBtnActiveTxt, !clipboard && s.toolbarBtnDisabledTxt]}>
                  {pasteMode ? 'Stamping: On' : 'Paste'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={s.comingSoonTxt}>
              Coming soon! Click individual diamonds to select an irregular shape.
            </Text>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>PATTERN TOOL</Text>
          <Text style={s.comingSoonTxt}>Coming soon.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardLabel}>BEHAVIOR CONTROLS</Text>
          <Text style={s.comingSoonTxt}>Coming soon.</Text>
        </View>
      </View>
    </View>
  );

  return (
    <>
      <ScrollView
        style={s.screen}
        contentContainerStyle={s.content}
        stickyHeaderIndices={[0]}
      >
        {header}

        <View style={orientation === 'horizontal' ? s.bodyColumn : s.bodyRow}>
          <View style={s.gridArea} onLayout={e => setGridViewportWidth(e.nativeEvent.layout.width)}>
            <View style={s.edgeRowControls}>
              <TouchableOpacity style={s.edgeBtn} onPress={removeRowTop} title="Remove the top row">
                <Text style={s.edgeBtnTxt}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.edgeBtn} onPress={addRowTop} title="Add a row to the top">
                <Text style={s.edgeBtnTxt}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={s.gridWithSideEdges}>
              <View style={s.edgeColControls}>
                <TouchableOpacity style={s.edgeBtn} onPress={removeColumnLeft} title="Remove a column from the left">
                  <Text style={s.edgeBtnTxt}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.edgeBtn} onPress={addColumnLeft} title="Add a column to the left">
                  <Text style={s.edgeBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>

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
                    zoom={zoom}
                    selRange={selRange}
                    pasteMode={pasteMode}
                    clipboardWidth={clipboard?.width ?? null}
                  />
                </ScrollView>
              </View>

              <View style={s.edgeColControls}>
                <TouchableOpacity style={s.edgeBtn} onPress={decreaseLength} title="Remove a column from the right">
                  <Text style={s.edgeBtnTxt}>-</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.edgeBtn} onPress={increaseLength} title="Add a column to the right">
                  <Text style={s.edgeBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.edgeRowControls}>
              <TouchableOpacity style={s.edgeBtn} onPress={removeRowBottom} title="Remove the bottom row">
                <Text style={s.edgeBtnTxt}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.edgeBtn} onPress={addRowBottom} title="Add a row to the bottom">
                <Text style={s.edgeBtnTxt}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {orientation === 'horizontal'
            ? cardRow
            : (sidebarCollapsed ? collapsedSidebarToggle : sidebar)}
        </View>
      </ScrollView>

      <Modal
        visible={showStartOverConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartOverConfirm(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Start Over?</Text>
            <Text style={s.modalText}>
              This will discard your current pattern and take you back to the beginning. This can't be undone.
            </Text>
            <View style={s.modalButtonsRow}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setShowStartOverConfirm(false)}
              >
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalConfirmBtn}
                onPress={() => {
                  setShowStartOverConfirm(false);
                  storageRemove(STORAGE_KEYS.patternState(config.id));
                  onExit();
                }}
              >
                <Text style={s.modalConfirmTxt}>Start Over</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAccountRequiredModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccountRequiredModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Create an Account to Save</Text>
            <Text style={s.modalText}>
              You need an account to save your pattern. It only takes a minute, and you can keep designing here in the meantime.
            </Text>
            <View style={s.modalButtonsRow}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setShowAccountRequiredModal(false)}
              >
                <Text style={s.modalCancelTxt}>Not Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalConfirmAccentBtn}
                onPress={() => {
                  setShowAccountRequiredModal(false);
                  onRequireAccount();
                }}
              >
                <Text style={s.modalConfirmTxt}>Create Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSaveAsNewModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSaveAsNewModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Save As New Pattern</Text>
            <Text style={s.modalText}>
              This creates a brand new copy - your original pattern won't be changed.
            </Text>
            <input
              type="text"
              value={saveAsNewName}
              onChange={e => setSaveAsNewName(e.target.value)}
              style={saveAsNewInputStyle}
            />
            <View style={s.modalButtonsRow}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setShowSaveAsNewModal(false)}
              >
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirmAccentBtn} onPress={handleSaveAsNew}>
                <Text style={s.modalConfirmTxt}>Save Copy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSavedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSavedModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {savedModalMode === 'ask' ? (
              <>
                <Text style={s.modalTitle}>
                  {cloudSaveError ? 'Saved on This Device' : 'Saved!'}
                </Text>
                <Text style={s.modalText}>
                  {cloudSaveError
                    ? "We'll sync it online once you're connected again. Want to build this bracelet now?"
                    : 'Want to build this bracelet now?'}
                </Text>
                <View style={s.modalButtonsRow}>
                  <TouchableOpacity
                    style={s.modalCancelBtn}
                    onPress={() => setShowSavedModal(false)}
                  >
                    <Text style={s.modalCancelTxt}>Not Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.modalConfirmAccentBtn}
                    onPress={() => setSavedModalMode('coming-soon')}
                  >
                    <Text style={s.modalConfirmTxt}>Yes, Build It!</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.modalTitle}>Coming Soon!</Text>
                <Text style={s.modalText}>
                  The step-by-step building guide isn't ready yet - check back soon!
                </Text>
                <View style={s.modalButtonsRow}>
                  <TouchableOpacity
                    style={s.modalConfirmAccentBtn}
                    onPress={() => setShowSavedModal(false)}
                  >
                    <Text style={s.modalConfirmTxt}>Got It</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  screen:             { flex: 1, backgroundColor: '#fff' },
  content:            { flexGrow: 1 },
  header:             { backgroundColor: '#fff', paddingHorizontal: 40, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTopRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  titleRowLeft:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  headerRightGroup:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  title:              { fontSize: 18, fontWeight: '700', color: '#111' },
  colorsRow:          { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  circleBtn:          { width: 28, height: 28, borderRadius: 14 },
  changeColorsBtn:    { borderWidth: 1, borderColor: PURPLE, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f3f0ff' },
  changeColorsBtnTxt: { fontSize: 12, fontWeight: '600', color: PURPLE },
  groupLabel:         { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#9ca3af', marginRight: 4 },
  tabBar:             { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tabBtn:             { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  tabBtnActive:       { backgroundColor: '#f3f0ff', borderColor: PURPLE },
  tabBtnTxt:          { fontSize: 13, fontWeight: '700', color: '#374151' },
  tabBtnActiveTxt:    { color: PURPLE },
  tabPanel:           { paddingTop: 12, paddingHorizontal: 4, gap: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 8 },
  sectionToolsRow:    { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  comingSoonTxt:      { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  bodyRow:            { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  bodyColumn:         { flexDirection: 'column', flex: 1 },
  cardRowOuter:       { flex: 1, backgroundColor: '#f3f4f6', paddingVertical: 18, paddingHorizontal: 24 },
  cardRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card:               { flex: 1, minWidth: 200, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, gap: 8 },
  cardLabel:          { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#9ca3af' },
  selectorModeToggle: { flexDirection: 'row', gap: 4, backgroundColor: '#f3f4f6', borderRadius: 6, padding: 3, alignSelf: 'flex-start' },
  selectorModeBtn:    { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 4 },
  selectorModeBtnActive: { backgroundColor: '#fff' },
  selectorModeBtnTxt: { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  selectorModeBtnActiveTxt: { color: '#111', fontWeight: '700' },
  gridArea:           { flex: 1, alignItems: 'center', paddingVertical: 16, backgroundColor: '#fff' },
  edgeRowControls:    { flexDirection: 'row', gap: 6, marginVertical: 20 },
  gridWithSideEdges:  { flexDirection: 'row', alignItems: 'center' },
  edgeColControls:    { flexDirection: 'column', gap: 6, marginHorizontal: 20, flexShrink: 0 },
  edgeBtn:            { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center' },
  edgeBtnTxt:         { fontSize: 14, fontWeight: '700', color: '#374151' },
  sidebar:            { width: 240, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', paddingHorizontal: 16, paddingVertical: 16, gap: 14 },
  sidebarHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sidebarCollapseBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#f3f0ff' },
  sidebarCollapseBtnTxt: { fontSize: 11, color: PURPLE, fontWeight: '700' },
  sidebarExpandBtn:   { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#f3f0ff' },
  sidebarExpandBtnTxt: { fontSize: 11, color: PURPLE, fontWeight: '700' },
  sidebarCollapsedStrip: { width: 44, borderLeftWidth: 1, borderLeftColor: '#e5e7eb', paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 14 },
  collapsedColorsCol: { flexDirection: 'column', gap: 6, alignItems: 'center' },
  collapsedCircleBtn: { width: 22, height: 22, borderRadius: 11 },
  toolbarBtn:         { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fafafa' },
  orientationBtn:     { minWidth: 132, alignItems: 'center' },
  toolbarBtnActive:   { backgroundColor: '#f3f0ff', borderColor: PURPLE },
  toolbarBtnActiveTxt:{ color: PURPLE },
  toolbarBtnDisabled: { opacity: 0.4 },
  toolbarBtnDisabledTxt: { color: '#9ca3af' },
  modalOverlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard:          { backgroundColor: '#fff', borderRadius: 14, padding: 24, maxWidth: 360, width: '100%', gap: 10 },
  modalTitle:         { fontSize: 18, fontWeight: '700', color: '#111' },
  modalText:          { fontSize: 13, color: '#6b7280', lineHeight: 19, marginBottom: 8 },
  modalButtonsRow:    { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn:     { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fafafa' },
  modalCancelTxt:     { fontSize: 13, fontWeight: '600', color: '#374151' },
  modalConfirmBtn:    { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#dc2626' },
  modalConfirmAccentBtn: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: PURPLE },
  modalConfirmTxt:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  toolbarBtnTxt:      { fontSize: 12, fontWeight: '600', color: '#374151' },
  saveBtn:            { backgroundColor: PURPLE, borderColor: PURPLE },
  saveBtnTxt:         { fontSize: 12, fontWeight: '700', color: '#fff' },
  zoomRow:            { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' },
  zoomBtn:            { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  zoomBtnDisabled:    { opacity: 0.35 },
  zoomBtnTxt:         { fontSize: 18, color: '#374151' },
  zoomLabel:          { width: 48, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#374151' },
  gridScrollWrapper:  { flexShrink: 1, minWidth: 0 },
  gridScroll:         { flexShrink: 1 },
  gridContent:        {},
  gridContentCentered:{ minWidth: '100%', justifyContent: 'center' },
});