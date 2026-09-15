/**
 * s3 StorageProvider adapter (S3-compatible: AWS/MinIO/R2).
 */
import { createHash, createHmac } from 'node:crypto';
import type { StorageConfig, StorageFolder } from '../../../config/index.js';
import type { Logger } from '../../../infrastructure/logger/index.js';
import { providerErrors } from '../../../infrastructure/telemetry/metrics.js';
import {
  isPrivateFolder,
  type StorageProvider,
  type UploadInput,
  type UploadResult,
} from '../storage-provider.interface.js';

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';

/**
 * Talks S3 directly with SigV4 rather than pulling in the AWS SDK.
 *
 * The SDK is tens of megabytes for the four operations this needs, and SigV4
 * is a well-specified signing procedure that fits in this file. The trade is
 * deliberate: less to ship, more to keep correct here.
 *
 * ponytail: hand-rolled SigV4 for PUT/GET/DELETE/HEAD plus presigned URLs.
 * Swap in @aws-sdk/client-s3 if multipart uploads or bucket management are
 * ever needed.
 */
export class S3StorageProvider implements StorageProvider {
  readonly id = 's3';

  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly endpoint: string;

  constructor(
    private readonly config: StorageConfig,
    private readonly logger: Logger,
  ) {
    this.accessKey = config.accessKey ?? '';
    this.secretKey = config.secretKey ?? '';
    // Path-style so MinIO and R2 work without per-bucket DNS.
    this.endpoint = (config.endpoint ?? `https://s3.${config.region}.amazonaws.com`).replace(
      /\/$/,
      '',
    );
  }

  private objectPath(folder: StorageFolder, key: string): string {
    return `/${this.config.bucket}/${folder}/${key}`;
  }

  async upload(input: UploadInput): Promise<UploadResult> {
    const path = this.objectPath(input.folder, input.key);
    const payloadHash = createHash('sha256').update(input.body).digest('hex');

    const headers = this.sign(
      'PUT',
      path,
      {
        'content-type': input.contentType,
        'content-length': String(input.body.byteLength),
        'x-amz-content-sha256': payloadHash,
      },
      payloadHash,
    );

    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'PUT',
      headers,
      body: new Uint8Array(input.body),
    });

    if (!response.ok) {
      providerErrors.labels('s3', 'upload').inc();
      throw new Error(`S3 upload failed: ${response.status}`);
    }

    return {
      key: input.key,
      // Private folders have no public URL by design; callers must sign one.
      url: isPrivateFolder(input.folder)
        ? null
        : `${this.config.publicUrl ?? this.endpoint}/${input.folder}/${input.key}`,
      size: input.body.byteLength,
    };
  }

  /**
   * Presigned GET. Query-string signing, so the URL can be handed to a browser
   * or an app with no credentials attached.
   */
  async getSignedUrl(folder: StorageFolder, key: string, ttlSeconds?: number): Promise<string> {
    const expires = ttlSeconds ?? this.config.signedUrlTtlSeconds;
    const path = this.objectPath(folder, key);
    const { date, stamp } = timestamps();
    const scope = `${stamp}/${this.config.region}/${SERVICE}/aws4_request`;

    const query = new URLSearchParams({
      'X-Amz-Algorithm': ALGORITHM,
      'X-Amz-Credential': `${this.accessKey}/${scope}`,
      'X-Amz-Date': date,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    });

    const host = new URL(this.endpoint).host;
    const canonical = [
      'GET',
      path,
      query.toString(),
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      ALGORITHM,
      date,
      scope,
      createHash('sha256').update(canonical).digest('hex'),
    ].join('\n');

    query.set('X-Amz-Signature', this.signature(stamp, stringToSign));
    return `${this.endpoint}${path}?${query.toString()}`;
  }

  async delete(folder: StorageFolder, key: string): Promise<void> {
    const path = this.objectPath(folder, key);
    const emptyHash = createHash('sha256').update('').digest('hex');

    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'DELETE',
      headers: this.sign('DELETE', path, { 'x-amz-content-sha256': emptyHash }, emptyHash),
    });

    if (!response.ok && response.status !== 404) {
      providerErrors.labels('s3', 'delete').inc();
      this.logger.warn({ status: response.status, key }, 's3 delete failed');
    }
  }

  async exists(folder: StorageFolder, key: string): Promise<boolean> {
    const path = this.objectPath(folder, key);
    const emptyHash = createHash('sha256').update('').digest('hex');

    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'HEAD',
      headers: this.sign('HEAD', path, { 'x-amz-content-sha256': emptyHash }, emptyHash),
    });

    return response.ok;
  }

  /** SigV4 header signing for a request with no query string. */
  private sign(
    method: string,
    path: string,
    extraHeaders: Record<string, string>,
    payloadHash: string,
  ): Record<string, string> {
    const { date, stamp } = timestamps();
    const host = new URL(this.endpoint).host;

    const headers: Record<string, string> = {
      ...extraHeaders,
      host,
      'x-amz-date': date,
    };

    // Canonical headers must be lowercase and sorted by name.
    const names = Object.keys(headers)
      .map((name) => name.toLowerCase())
      .sort();
    const canonicalHeaders = names.map((name) => `${name}:${headers[name] ?? ''}\n`).join('');
    const signedHeaders = names.join(';');

    const canonical = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${stamp}/${this.config.region}/${SERVICE}/aws4_request`;
    const stringToSign = [
      ALGORITHM,
      date,
      scope,
      createHash('sha256').update(canonical).digest('hex'),
    ].join('\n');

    return {
      ...headers,
      authorization: `${ALGORITHM} Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${this.signature(stamp, stringToSign)}`,
    };
  }

  /** The SigV4 key derivation chain: date, region, service, request. */
  private signature(stamp: string, stringToSign: string): string {
    const hmac = (key: Buffer | string, data: string): Buffer =>
      createHmac('sha256', key).update(data).digest();

    const dateKey = hmac(`AWS4${this.secretKey}`, stamp);
    const regionKey = hmac(dateKey, this.config.region);
    const serviceKey = hmac(regionKey, SERVICE);
    const signingKey = hmac(serviceKey, 'aws4_request');

    return createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  }
}

function timestamps(): { date: string; stamp: string } {
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { date, stamp: date.slice(0, 8) };
}
