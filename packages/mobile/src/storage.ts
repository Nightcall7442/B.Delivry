/**
 * JSON in AsyncStorage. Every store hydrates from here once, then writes
 * through; a failed read is an empty value, never a crash.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readJson<T>(
  key: string,
  guard: (value: unknown) => value is T,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {
    // Kept in memory for this session.
  });
}
