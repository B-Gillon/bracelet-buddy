import { supabase } from './supabaseClient';

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  country: string | null;
  avatar_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = Partial<
  Pick<Profile, 'first_name' | 'last_name' | 'username' | 'country' | 'avatar_id'>
>;

export async function getProfile(
  userId: string
): Promise<{ profile: Profile | null; error: string | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  return { profile: (data as Profile) ?? null, error: error ? error.message : null };
}

export async function isUsernameTaken(
  username: string,
  excludingUserId: string
): Promise<{ taken: boolean | null; error: string | null }> {
  const { data, error } = await supabase.rpc('is_username_taken', {
    check_username: username,
    excluding_user_id: excludingUserId,
  });

  return { taken: error ? null : (data as boolean), error: error ? error.message : null };
}

export async function updateProfile(
  userId: string,
  updates: ProfileUpdate
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);

  return { error: error ? error.message : null };
}
