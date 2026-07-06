import { supabase } from './supabaseClient';
import { PatternConfig, DualGrid, PatternGrid } from '../types/pattern';

// Displays the database-generated identity as a fixed 6-digit code
// (e.g. "000001"), rather than a raw integer - the underlying column
// itself stays a plain incrementing bigint.
export function formatPatternNumber(displayNumber: number): string {
  return String(displayNumber).padStart(6, '0');
}

export type SavedPatternSummary = {
  clientId: string;
  displayNumber: number;
  name: string;
  type: string;
  colorCount: number;
  palette: (string | null)[];
  cols: number;
  rows: number;
  updatedAt: number;
  createdAt: number;
  gridMain: PatternGrid;
  gridGap: PatternGrid;
};

// Upserts by (user_id, client_id) - matches the unique constraint on the
// table, so re-saving the same pattern updates the existing row rather
// than creating a duplicate. This is the one function used by both a
// normal Save and a "Save As New" (the caller just passes a config with a
// fresh id for the latter).
export async function savePattern(
  userId: string,
  config: PatternConfig,
  dualGrid: DualGrid
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('patterns').upsert(
    {
      user_id: userId,
      client_id: config.id,
      name: config.name,
      type: config.type,
      color_count: config.colorCount,
      palette: config.palette,
      cols: config.cols,
      rows: config.rows,
      grid_main: dualGrid.main,
      grid_gap: dualGrid.gap,
      updated_at: new Date(config.updatedAt).toISOString(),
    },
    { onConflict: 'user_id,client_id' }
  );

  return { error: error ? error.message : null };
}

// Deliberately excludes grid_main/grid_gap - the list view only needs
// metadata for the cards, not the full (potentially large) grid data for
// every saved pattern.
export async function listPatterns(
  userId: string
): Promise<{ patterns: SavedPatternSummary[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('patterns')
    .select('client_id, display_number, name, type, color_count, palette, cols, rows, updated_at, created_at, grid_main, grid_gap')
    .eq('user_id', userId)
    .order('display_number', { ascending: true });

  if (error) return { patterns: null, error: error.message };

  const patterns: SavedPatternSummary[] = (data ?? []).map(row => ({
    clientId: row.client_id,
    displayNumber: row.display_number,
    name: row.name,
    type: row.type,
    colorCount: row.color_count,
    palette: row.palette,
    cols: row.cols,
    rows: row.rows,
    updatedAt: new Date(row.updated_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
    gridMain: row.grid_main,
    gridGap: row.grid_gap,
  }));

  return { patterns, error: null };
}

export async function loadPattern(
  userId: string,
  clientId: string
): Promise<{ config: PatternConfig | null; dualGrid: DualGrid | null; error: string | null }> {
  const { data, error } = await supabase
    .from('patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) return { config: null, dualGrid: null, error: error.message };
  if (!data) return { config: null, dualGrid: null, error: 'Pattern not found.' };

  const config: PatternConfig = {
    id: data.client_id,
    name: data.name,
    type: data.type as PatternConfig['type'],
    colorCount: data.color_count,
    palette: data.palette,
    cols: data.cols,
    rows: data.rows,
    createdAt: new Date(data.created_at).getTime(),
    updatedAt: new Date(data.updated_at).getTime(),
  };

  const dualGrid: DualGrid = {
    main: data.grid_main,
    gap: data.grid_gap,
  };

  return { config, dualGrid, error: null };
}
