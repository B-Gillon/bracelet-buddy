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
//
// Selects display_number back after the upsert - without this, callers
// have no way to know the database-assigned number, which is what the
// "New Bracelet" -> "Bracelet #NNNNNN" auto-rename on first save depends
// on.
//
// Deliberately a SEPARATE query after the upsert, not .select() chained
// directly onto it. Postgres's RETURNING clause reflects the row exactly
// as written by the INSERT itself - display_number is still null at that
// point, since assign_display_number is an AFTER INSERT trigger that runs
// (and does its own UPDATE) once the INSERT has already completed. A
// chained .select() therefore always saw null on a pattern's first save,
// which is why the auto-rename never fired. Querying separately, after the
// upsert has resolved, sees the trigger's committed update.
export async function savePattern(
  userId: string,
  config: PatternConfig,
  dualGrid: DualGrid
): Promise<{ displayNumber: number | null; error: string | null }> {
  const { error: upsertError } = await supabase
    .from('patterns')
    .upsert(
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

  if (upsertError) {
    // The unique index on (user_id, lower(name)) raises a raw Postgres
    // unique-violation here if a name collision slipped past the live
    // check (e.g. two tabs saving at once) - translate it into the same
    // kid-friendly message the live check shows.
    const message = upsertError.code === '23505'
      ? 'You already have a bracelet with that name - try another one.'
      : upsertError.message;
    return { displayNumber: null, error: message };
  }

  const { data, error: selectError } = await supabase
    .from('patterns')
    .select('display_number')
    .eq('user_id', userId)
    .eq('client_id', config.id)
    .single();

  if (selectError) return { displayNumber: null, error: selectError.message };

  return { displayNumber: data?.display_number ?? null, error: null };
}

// Scoped to the caller's own patterns by RLS (no SECURITY DEFINER needed,
// unlike is_username_taken - that one has to see across all users, this
// only ever needs to see the signed-in user's own rows). excludeClientId
// lets a normal re-save of an already-named pattern not flag itself.
export async function isPatternNameTaken(
  userId: string,
  name: string,
  excludeClientId?: string
): Promise<{ taken: boolean; error: string | null }> {
  // Compares case-insensitively in JS rather than an ilike() filter - ilike
  // treats % and _ in the name as wildcards, which would misfire on a
  // bracelet literally named e.g. "50% Chevron".
  const { data, error } = await supabase
    .from('patterns')
    .select('client_id, name')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) return { taken: false, error: error.message };

  const trimmedLower = name.trim().toLowerCase();
  const taken = (data ?? []).some(
    row => row.client_id !== excludeClientId && row.name.trim().toLowerCase() === trimmedLower
  );
  return { taken, error: null };
}

// Soft delete - sets deleted_at rather than removing the row, so nothing is
// actually erased from the database. listPatterns() and isPatternNameTaken()
// both filter deleted_at is null, so a deleted pattern disappears from My
// Designs and its name immediately becomes reusable (the unique index is a
// partial index scoped to deleted_at is null for the same reason).
export async function deletePattern(
  userId: string,
  clientId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('patterns')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('client_id', clientId);

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
    .is('deleted_at', null)
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
