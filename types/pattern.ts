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
