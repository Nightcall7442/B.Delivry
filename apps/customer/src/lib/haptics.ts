/** A light tick under the finger on device; the web has no motor. */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function tap(): void {
  if (Platform.OS === 'web') return;
  void Haptics.selectionAsync().catch(() => undefined);
}
