/**
 * One API client per app. Tokens live in SecureStore on a device and in
 * AsyncStorage on the web build (SecureStore has no web implementation);
 * the refresh token is the one secret the app keeps, so it never touches
 * plain storage on a phone.
 */
import { createApiClient, type ApiClient, type TokenStore, type Tokens } from '@bazar/api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'bazar.tokens';

const secure = Platform.OS !== 'web';

export const tokenStore: TokenStore = {
  async get(): Promise<Tokens | null> {
    try {
      const raw = secure ? await SecureStore.getItemAsync(KEY) : await AsyncStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  async set(tokens: Tokens | null): Promise<void> {
    try {
      if (tokens === null) {
        if (secure) await SecureStore.deleteItemAsync(KEY);
        else await AsyncStorage.removeItem(KEY);
        return;
      }
      const raw = JSON.stringify(tokens);
      if (secure) await SecureStore.setItemAsync(KEY, raw);
      else await AsyncStorage.setItem(KEY, raw);
    } catch {
      // Signed in for this session only.
    }
  },
};

const signedOutListeners = new Set<() => void>();

/** Fires when a refresh fails for good: the app returns to the login screen. */
export function onSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
}

let client: ApiClient | null = null;

export function api(): ApiClient {
  if (client === null) {
    client = createApiClient({
      baseUrl: process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:4000/api/v1',
      tokens: tokenStore,
      locale: () => 'ru',
      onSignedOut: () => {
        for (const listener of signedOutListeners) listener();
      },
    });
  }
  return client;
}
