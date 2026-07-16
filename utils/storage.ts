import AsyncStorage from '@react-native-async-storage/async-storage';

// Namespaced + versioned so future schema changes can bump the version
// without colliding with old cached data on a user's device.
export const STORAGE_KEYS = {
  session: 'braceletBuddy:session:v1',
  patternState: (patternId: string) => `braceletBuddy:patternState:v1:${patternId}`,
  themePreference: 'braceletBuddy:themePreference:v1',
  buildProgress: (patternId: string) => `braceletBuddy:buildProgress:v1:${patternId}`,
};

export async function storageGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('[storage] failed to read key:', key, err);
    return null;
  }
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[storage] failed to write key:', key, err);
  }
}

export async function storageRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (err) {
    console.warn('[storage] failed to remove key:', key, err);
  }
}
