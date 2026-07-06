// These values are safe to be public - the publishable key is not a
// secret. Access is controlled by RLS policies on the database, not by
// hiding this. They come from environment variables (EXPO_PUBLIC_ prefix
// is required for Expo to inline them into the client bundle) rather than
// being hardcoded, so the same code works across local dev and Vercel
// without editing this file per-environment.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Make sure EXPO_PUBLIC_SUPABASE_URL and ' +
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env file (local) or in your ' +
    'Vercel project\'s Environment Variables (deployed).'
  );
}
