// Required for @supabase/supabase-js to work correctly in React Native's
// JS engine, which doesn't have a full URL implementation built in. Must
// be imported before `createClient` is called.
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../constants/supabaseConfig';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // Reuses the same AsyncStorage-backed persistence already set up for
    // local pattern caching, so the session survives a refresh/app restart
    // the same way local patterns do.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Enables auto sign-in from the confirmation email's redirect link
    // (Supabase appends session tokens to the URL after confirming). Only
    // matters on web - native has no browser URL to detect a session in.
    detectSessionInUrl: true,
  },
});
