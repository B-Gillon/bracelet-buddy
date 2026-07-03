import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import Svg, { Rect, Polygon } from 'react-native-svg';
import { PatternConfig, PatternGrid, createEmptyGrid } from '../types/pattern';
import ColorPickerScreen from './ColorPickerScreen';
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from '../utils/storage';

const EMPTY_FILL = '#f0efeb';
const STROKE     = '#c8c6bc';
const BORDER     = '#b0aea4';
const PURPLE     = '#7c3aed';

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

type CellInfo = {
  key:    string;
  cx:     number;
  cy:     number;
  pass:   'main' | 'gap';
  gr:     number;
  gc:     number;
  points: string;
};

function buildCells(mainRows: number, mainCols: number, D: number): CellInfo[] {
  const H = D / 2;
  const cells: CellInfo[] = [];

  function pts(cx: number, cy: number): string {
    return (
      cx + ',' + (cy - H) + ' ' +
      (cx + H) + ',' + cy + ' ' +
      cx + ',' + (cy + H) + ' ' +
      (cx - H) + ',' + cy
    );
  }

  for (let dr = 0; dr < mainRows; dr++) {
    for (let dc = 0; dc < mainCols; dc++) {
      const cx = dc * D + H;
      const cy = dr * D + H;
      cells.push({ key: 'main-' + dr + '-' + dc, cx, cy, pass: 'main', gr: dr, gc: dc, points: pts(cx, cy) });
    }
  }

  const gapRows = mainRows + 1;
  const gapCols = mainCols + 1;
  for (let dr = 0; dr < gapRows; dr++) {
    for (let dc = 0; dc < gapCols; dc++) {
      const cx = dc * D;
      const cy = dr * D;
      cells.push({ key: 'gap-' + dr + '-' + dc, cx, cy, pass: 'gap', gr: dr, gc: dc, points: pts(cx, cy) });
    }
  }

  return cells;
}

type DualGrid = {
  main: PatternGrid;
  gap:  PatternGrid;
};

function createDualGrid(mainRows: number, mainCols: number): DualGrid {
  return {
    main: createEmptyGrid(mainCols, mainRows),
    gap:  createEmptyGrid(mainCols + 1, mainRows + 1),
  };
}

function PatternGridView({
  dualGrid, orientation, onCellPress, onCellDrag, zoom,
}: {
  dualGrid:    DualGrid;
  orientation: 'horizontal' | 'vertical';
  onCellPress: (pass: 'main' | 'gap', r: number, c: number) => void;
  onCellDrag:  (pass: 'main' | 'gap', r: number, c: number) => void;
  zoom:        number;
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
    const cell = findCell(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    if (!cell) return;
    lastCellRef.current = cell.key;
    const { r, c } = resolveCell(cell);
    onCellPress(cell.pass, r, c);
  }

  function handleMove(evt: any) {
    const cell = findCell(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    if (!cell) return;
    if (cell.key === lastCellRef.current) return;
    lastCellRef.current = cell.key;
    const { r, c } = resolveCell(cell);
    onCellDrag(cell.pass, r, c);
  }

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
      </Svg>

      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handlePress}
        onResponderMove={handleMove}
        onResponderRelease={() => { lastCellRef.current = null; }}
      />
    </View>
  );
}

export default function BuildScreen({
  config,
  onConfigChange,
  onExit,
}: {
  config:         PatternConfig;
  onConfigChange: (config: PatternConfig) => void;
  onExit:         () => void;
}) {
  const [dualGrid, setDualGrid]                 = useState<DualGrid>(() => createDualGrid(config.rows, config.cols));
  const [palette, setPalette]                   = useState<(string | null)[]>(config.palette);
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [orientation, setOrientation]           = useState<'horizontal' | 'vertical'>('horizontal');
  const [zoomIdx, setZoomIdx]                   = useState(2);
  const [showColorPicker, setShowColorPicker]   = useState(false);
  const [fitToWindow, setFitToWindow]           = useState(false);
  const [gridViewportWidth, setGridViewportWidth] = useState(0);
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const [hydrated, setHydrated]                 = useState(false);
  const saveTimeoutRef                          = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const zoom = ZOOM_LEVELS[zoomIdx];

  // In horizontal mode the grid's horizontal span is driven by the
  // bracelet length (config.cols).
  const fitActive = orientation === 'horizontal' && fitToWindow;
  const gridScrollPadding = 80; // matches s.gridScroll paddingHorizontal * 2
  const availableGridWidth = Math.max(0, gridViewportWidth - gridScrollPadding);
  const fitZoom = availableGridWidth > 0 && config.cols > 0
    ? availableGridWidth / (config.cols * GRID_BASE)
    : zoom;
  const effectiveZoom = fitActive ? fitZoom : zoom;

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

  function handleClear() {
    pushHistory();
    setDualGrid(createDualGrid(config.rows, config.cols));
  }

  function handleSave() {
    onConfigChange({ ...config, palette, updatedAt: Date.now() });
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
        <Text style={s.title}>{config.name}</Text>
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

      <View style={s.actionsRow}>
        <View style={s.controlsGroup}>
          <TouchableOpacity style={s.controlBtn} onPress={addRowTop}>
            <Text style={s.controlBtnTxt}>Add Top Row</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.controlBtn} onPress={removeRowTop}>
            <Text style={s.controlBtnTxt}>Remove Top Row</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.controlBtn} onPress={addRowBottom}>
            <Text style={s.controlBtnTxt}>Add Bottom Row</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.controlBtn} onPress={removeRowBottom}>
            <Text style={s.controlBtnTxt}>Remove Bottom Row</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.controlBtn} onPress={increaseLength}>
            <Text style={s.controlBtnTxt}>Increase Length</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.controlBtn} onPress={decreaseLength}>
            <Text style={s.controlBtnTxt}>Decrease Length</Text>
          </TouchableOpacity>
        </View>

        <View style={s.headerRightGroup}>
          <TouchableOpacity style={s.toolbarBtn} onPress={() => setShowStartOverConfirm(true)}>
            <Text style={s.toolbarBtnTxt}>Start Over</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.toolbarBtn, s.orientationBtn]}
            onPress={() => setOrientation(o => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
          >
            <Text style={s.toolbarBtnTxt}>
              {orientation === 'horizontal' ? 'Show Vertical' : 'Show Horizontal'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.toolbarBtn,
              fitToWindow && s.toolbarBtnActive,
              orientation !== 'horizontal' && s.toolbarBtnDisabled,
            ]}
            onPress={() => setFitToWindow(f => !f)}
            disabled={orientation !== 'horizontal'}
          >
            <Text
              style={[
                s.toolbarBtnTxt,
                fitToWindow && s.toolbarBtnActiveTxt,
                orientation !== 'horizontal' && s.toolbarBtnDisabledTxt,
              ]}
            >
              {fitToWindow ? 'Fit: On' : 'Fit to Window'}
            </Text>
          </TouchableOpacity>

          <View style={s.zoomRow}>
            <TouchableOpacity
              style={[s.zoomBtn, (zoomIdx <= 0 || fitActive) && s.zoomBtnDisabled]}
              onPress={() => setZoomIdx(i => Math.max(0, i - 1))}
              disabled={zoomIdx <= 0 || fitActive}
            >
              <Text style={s.zoomBtnTxt}>-</Text>
            </TouchableOpacity>
            <Text style={s.zoomLabel}>{Math.round(effectiveZoom * 100)}%</Text>
            <TouchableOpacity
              style={[s.zoomBtn, (zoomIdx >= ZOOM_LEVELS.length - 1 || fitActive) && s.zoomBtnDisabled]}
              onPress={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
              disabled={zoomIdx >= ZOOM_LEVELS.length - 1 || fitActive}
            >
              <Text style={s.zoomBtnTxt}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.toolbarBtn} onPress={handleUndo}>
            <Text style={s.toolbarBtnTxt}>Undo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.toolbarBtn} onPress={handleClear}>
            <Text style={s.toolbarBtnTxt}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.toolbarBtn, s.saveBtn]} onPress={handleSave}>
            <Text style={s.saveBtnTxt}>Save</Text>
          </TouchableOpacity>
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          style={s.gridScroll}
          contentContainerStyle={[
            s.gridContent,
            orientation === 'vertical' && s.gridContentCentered,
          ]}
          onLayout={e => setGridViewportWidth(e.nativeEvent.layout.width)}
        >
          <PatternGridView
            dualGrid={dualGrid}
            orientation={orientation}
            onCellPress={handleCellPress}
            onCellDrag={handleCellDrag}
            zoom={effectiveZoom}
          />
        </ScrollView>
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
    </>
  );
}

const s = StyleSheet.create({
  screen:             { flex: 1, backgroundColor: '#fff' },
  content:            { flexGrow: 1 },
  header:             { backgroundColor: '#fff', paddingHorizontal: 40, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTopRow:       { marginBottom: 12 },
  headerRightGroup:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  title:              { fontSize: 18, fontWeight: '700', color: '#111' },
  colorsRow:          { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 },
  circleBtn:          { width: 40, height: 40, borderRadius: 20 },
  changeColorsBtn:    { borderWidth: 1, borderColor: PURPLE, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f3f0ff' },
  changeColorsBtnTxt: { fontSize: 12, fontWeight: '600', color: PURPLE },
  actionsRow:         { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  controlsGroup:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  controlBtn:         { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fafafa' },
  controlBtnTxt:      { fontSize: 12, fontWeight: '600', color: '#374151' },
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
  modalConfirmTxt:    { fontSize: 13, fontWeight: '700', color: '#fff' },
  toolbarBtnTxt:      { fontSize: 12, fontWeight: '600', color: '#374151' },
  saveBtn:            { backgroundColor: PURPLE, borderColor: PURPLE },
  saveBtnTxt:         { fontSize: 12, fontWeight: '700', color: '#fff' },
  zoomRow:            { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' },
  zoomBtn:            { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  zoomBtnDisabled:    { opacity: 0.35 },
  zoomBtnTxt:         { fontSize: 18, color: '#374151' },
  zoomLabel:          { width: 48, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#374151' },
  gridScroll:         { paddingHorizontal: 40, paddingTop: 16 },
  gridContent:        { paddingBottom: 40 },
  gridContentCentered:{ minWidth: '100%', justifyContent: 'center' },
});