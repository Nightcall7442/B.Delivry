/** Endpoint functions for /uploads — image bytes in, a public URL out. */
import type { Http } from '../client.js';

export type UploadFolder =
  'weighing' | 'delivery-proofs' | 'avatars' | 'reviews' | 'product-images' | 'store-images';

export const uploadsApi = (http: Http) => ({
  image: (folder: UploadFolder, bytes: Blob | ArrayBuffer | Uint8Array, contentType: string) =>
    http.request<{ url: string; key: string; size: number }>('POST', `/uploads/${folder}`, {
      raw: bytes,
      contentType,
    }),
  /** Photo of a paper shopping list → its text (OCR, ru + uz). */
  recognize: (bytes: Blob | ArrayBuffer | Uint8Array, contentType: string) =>
    http.request<{ text: string }>('POST', '/uploads/recognize', { raw: bytes, contentType }),
});
