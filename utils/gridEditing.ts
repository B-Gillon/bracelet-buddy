import { DualGrid, createEmptyGrid } from '../types/pattern';
import { FloatingCell } from '../components/PatternGridView';

// Pure grid-editing logic extracted from BuildScreen.tsx - none of this
// depends on component state, so it lives here alongside utils/diamondGrid.ts
// (which handles diamond position/render math) rather than inline in the
// screen. BuildScreen still owns all the actual editor STATE (dualGrid,
// selectedCells, floatingOp, history) directly - these are just the pure
// functions that state gets run through.

// How far to the right (in columns) a fresh Duplicate/Move copy starts out
// from its source, so it's never dropped directly on top and looks
// obviously separate the moment it appears.
export const FLOATING_OP_DEFAULT_OFFSET = 3;

// A Duplicate or Move in progress - a snapshot of the selected diamonds'
// original position/color plus a live (dr, dc) offset that changes as the
// user drags it around. For Duplicate, dualGrid isn't touched until Done
// commits it. For Move, the source is cleared immediately (see
// beginFloatingOp) so it visibly looks picked-up rather than duplicated -
// beforeSnapshot is the grid exactly as it was before that happened, so
// Cancel can restore it exactly and Done can record a single Undo step
// covering the whole pickup+drop.
export type FloatingOp = {
  kind:  'duplicate' | 'move';
  cells: FloatingCell[]; // original (pre-drag) pass/r/c/color
  dr:    number;
  dc:    number;
  beforeSnapshot: DualGrid;
};

export function snapshotGrid(grid: DualGrid): DualGrid {
  return { main: grid.main.map(row => row.slice()), gap: grid.gap.map(row => row.slice()) };
}

export function createDualGrid(mainRows: number, mainCols: number): DualGrid {
  return {
    main: createEmptyGrid(mainCols, mainRows),
    gap:  createEmptyGrid(mainCols + 1, mainRows + 1),
  };
}

// True geometric neighbors of a diamond in the dual-grid weave (see
// utils/diamondGrid.ts for the actual position math). Diamonds only ever
// share a full edge with a diamond from the OTHER pass - two main beads (or
// two gap connectors) only ever touch at a single corner point, never an
// edge - so a main(r,c) cell's real neighbors are the 4 gap cells around
// it, and a gap(r,c) cell's real neighbors are the 4 main cells around it.
// rows/cols here are the MAIN grid's dimensions (gap is always rows+1 x
// cols+1).
export function neighborsOf(
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
export function floodFillRegion(
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
export function flipSelection(
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
