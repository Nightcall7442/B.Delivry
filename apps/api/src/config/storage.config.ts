/**
 * Storage configuration slice.
 */
import { LIMITS } from '@bazar/constants';
import type { Env } from './env.schema.js';

/** Buckets are logical prefixes inside one physical bucket. */
export const STORAGE_FOLDER = {
  PRODUCT_IMAGES: 'product-images',
  STORE_IMAGES: 'store-images',
  DOCUMENTS: 'documents',
  DELIVERY_PROOFS: 'delivery-proofs',
  AVATARS: 'avatars',
  /** The scale, photographed by the courier: public, the customer looks at it. */
  WEIGHING: 'weighing',
  /** What arrived, photographed by the customer for a review. */
  REVIEWS: 'reviews',
} as const;

export type StorageFolder = (typeof STORAGE_FOLDER)[keyof typeof STORAGE_FOLDER];

export interface StorageConfig {
  provider: Env['STORAGE_PROVIDER'];
  bucket: string;
  region: string;
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  publicUrl?: string;
  maxUploadBytes: number;
  /** Delivery proofs are private: served through short-lived signed URLs. */
  signedUrlTtlSeconds: number;
  allowedImageTypes: string[];
}

export function buildStorageConfig(env: Env): StorageConfig {
  return {
    provider: env.STORAGE_PROVIDER,
    bucket: env.STORAGE_BUCKET,
    region: env.STORAGE_REGION,
    ...(env.STORAGE_ENDPOINT !== undefined ? { endpoint: env.STORAGE_ENDPOINT } : {}),
    ...(env.STORAGE_ACCESS_KEY !== undefined ? { accessKey: env.STORAGE_ACCESS_KEY } : {}),
    ...(env.STORAGE_SECRET_KEY !== undefined ? { secretKey: env.STORAGE_SECRET_KEY } : {}),
    ...(env.STORAGE_PUBLIC_URL !== undefined ? { publicUrl: env.STORAGE_PUBLIC_URL } : {}),
    maxUploadBytes: LIMITS.UPLOAD_MAX_BYTES,
    signedUrlTtlSeconds: 900,
    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
  };
}
