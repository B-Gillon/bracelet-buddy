import { supabase } from './supabaseClient';

// Favorite colors for the "Choose Your Colors" picker - simple hex strings
// tied to a user_id, deduped server-side via the unique(user_id, color)
// constraint on favorite_colors. No local/offline fallback here (unlike
// patterns.ts's save flow) - favoriting is a small, low-stakes action, and
// requires being signed in in the first place.

export async function listFavoriteColors(userId: string): Promise<{ colors: string[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('favorite_colors')
    .select('color')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { colors: null, error: error.message };
  return { colors: (data ?? []).map(row => row.color as string), error: null };
}

export async function addFavoriteColor(userId: string, color: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('favorite_colors')
    .insert({ user_id: userId, color });

  // 23505 = unique_violation - the color's already favorited, which is the
  // end state the caller wanted anyway, so this isn't a real failure.
  if (error && (error as { code?: string }).code !== '23505') {
    return { error: error.message };
  }
  return { error: null };
}

export async function removeFavoriteColor(userId: string, color: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('favorite_colors')
    .delete()
    .eq('user_id', userId)
    .eq('color', color);

  return { error: error ? error.message : null };
}
