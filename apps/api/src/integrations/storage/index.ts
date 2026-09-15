/**
 * StorageProvider factory.
 */
import type { StorageConfig } from '../../config/index.js';
import type { Logger } from '../../infrastructure/logger/index.js';
import { LocalStorageProvider } from './providers/local.provider.js';
import { S3StorageProvider } from './providers/s3.provider.js';
import type { StorageProvider } from './storage-provider.interface.js';

export * from './storage-provider.interface.js';

export function createStorageProvider(config: StorageConfig, logger: Logger): StorageProvider {
  // Local is the development default; the env schema requires S3 credentials
  // before s3 can be selected at all.
  return config.provider === 's3'
    ? new S3StorageProvider(config, logger)
    : new LocalStorageProvider(config);
}
