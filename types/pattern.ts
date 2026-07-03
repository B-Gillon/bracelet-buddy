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

export function defaultPatternName(existingCount: number): string {
  return 'Bracelet #' + (existingCount + 1);
}