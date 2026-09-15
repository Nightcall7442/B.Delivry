/**
 * StorageProvider contract: upload, getSignedUrl, delete, exists. Buckets: product-images, store-images, documents, delivery-proofs.
 */
import type { StorageFolder } from '../../config/storage.config.js';

export interface UploadInput {
  folder: StorageFolder;
  /** File name inside the folder; callers generate it, never the client. */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface UploadResult {
  key: string;
  /** Public URL, or null for private folders served through signed URLs. */
  url: string | null;
  size: number;
}

export interface StorageProvider {
  readonly id: string;
  upload(input: UploadInput): Promise<UploadResult>;
  /** Time-limited URL for private objects (delivery proofs, documents). */
  getSignedUrl(folder: StorageFolder, key: string, ttlSeconds?: number): Promise<string>;
  delete(folder: StorageFolder, key: string): Promise<void>;
  exists(folder: StorageFolder, key: string): Promise<boolean>;
}

/** Delivery proofs and documents are private; images are served publicly. */
export const PRIVATE_FOLDERS: readonly string[] = ['delivery-proofs', 'documents'];

export const isPrivateFolder = (folder: StorageFolder): boolean => PRIVATE_FOLDERS.includes(folder);
