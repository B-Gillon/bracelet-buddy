import { Dispatch, SetStateAction } from 'react';
import { DualGrid, PatternConfig } from '../types/pattern';

// Row/column resize operations for BuildScreen - each one pushes an undo
// step, mutates dualGrid (adding a row/column of blanks, or trimming one),
// and updates config.rows/cols via onConfigChange in the same call, so the
// grid's actual shape and the persisted config never drift apart. Purely
// mechanical - pulled out of BuildScreen.tsx to keep the screen focused on
// tool/selection logic. Not a "real" hook (no internal state/effects) - the
// use* name is just for consistency with how BuildScreen calls it.
export function useGridDimensions(
  config: PatternConfig,
  onConfigChange: (config: PatternConfig) => void,
  setDualGrid: Dispatch<SetStateAction<DualGrid>>,
  pushHistory: (snapshot?: DualGrid) => void
) {
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

  return {
    addRowTop, removeRowTop, addRowBottom, removeRowBottom,
    increaseLength, decreaseLength, addColumnLeft, removeColumnLeft,
  };
}
