/**
 * local StorageProvider adapter (DEV ONLY).
 */
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { StorageConfig, StorageFolder } from '../../../config/index.js';
import type { StorageProvider, UploadInput, UploadResult } from '../storage-provider.interface.js';

/**
 * Writes to disk so a developer can run uploads without MinIO or an S3
 * account. Not for production: files live on one machine, which breaks the
 * moment a second instance is started.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly id = 'local';

  constructor(
    private readonly config: StorageConfig,
    private readonly root = resolve(process.cwd(), '.storage'),
  ) {}

  /**
   * Resolves inside the root and refuses anything that escapes it: a key of
   * `../../etc/passwd` must not become a write outside the store.
   */
  private pathFor(folder: StorageFolder, key: string): string {
    const target = resolve(join(this.root, folder, key));
    if (!target.startsWith(resolve(this.root))) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const path = this.pathFor(input.folder, input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);

    return {
      key: input.key,
      url: `${this.config.publicUrl ?? '/storage'}/${input.folder}/${input.key}`,
      size: input.body.byteLength,
    };
  }

  /** No signing on a local disk; the path is returned as-is. */
  async getSignedUrl(folder: StorageFolder, key: string): Promise<string> {
    return `${this.config.publicUrl ?? '/storage'}/${folder}/${key}`;
  }

  async delete(folder: StorageFolder, key: string): Promise<void> {
    await rm(this.pathFor(folder, key), { force: true });
  }

  async exists(folder: StorageFolder, key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(folder, key));
      return true;
    } catch {
      return false;
    }
  }
}
