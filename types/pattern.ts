export interface PatternConfig {
  id: string;
  name: string;
  type: 'bracelet';
  colorCount: number;
  palette: (string | null)[];
  cols: number;
  rows: number;
  createdAt: number;
  updatedAt: number;
}

export type CellState = string | null;

export type PatternGrid = CellState[][];

export function createEmptyGrid(cols: number, rows: number): PatternGrid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

// The placeholder name every new pattern starts with. The first successful
// save replaces it with the real Bracelet #NNNNNN name, using the
// database-assigned display_number - never guessed client-side, since the
// DB's numbering (max+1 per user, no gap-filling) is the only source of
// truth for what that number actually is.
export const DEFAULT_PATTERN_NAME = 'New Bracelet';

export interface DualGrid {
  main: PatternGrid;
  gap:  PatternGrid;
}

// Build Center instructions - see utils/knotInstructions.ts for how these
// get turned into actual per-knot arrows, and BUILD-CENTER-INSTRUCTIONS-
// PLAN.md for why direction is stored explicitly rather than inferred from
// color (color data alone can't always distinguish which direction a knot
// was tied - e.g. a Pink/Blue/Pink/Blue row shifted either way lands on the
// same result).
//
// One entry per instructional row (one main grid row + its adjoining gap
// row). A `null` entry means "use the computed centered-chevron default"
// rather than storing the default explicitly for every row - keeps a
// pattern's very first Build Center visit working with no backfill needed.
export type RowTechnique =
  | { type: 'diagonal'; direction: 'left' | 'right' }
  | { type: 'chevron'; splitCol: number };

export type RowTechniques = (RowTechnique | null)[];

// Which instructional rows have been marked as tied - a SET of indices
// (plain array, order doesn't matter), not a single "furthest row reached"
// counter, so any specific row can be marked or undone independently of
// whether it was the most recently marked one.
export type BuildProgress = number[];
