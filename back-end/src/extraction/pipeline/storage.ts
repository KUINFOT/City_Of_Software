/**
 * Blob storage for downloaded attachments.
 *
 * Deliberately an interface with a local-filesystem implementation behind it.
 * The database design is explicit that PDFs belong in object storage (GCS,
 * since Vertex AI is already GCP) and not in MongoDB — a Flex-tier cluster's
 * working set should not be carrying 8MB scanned announcements. Keeping the
 * seam here means swapping in GCS later touches one file, and nothing that
 * calls it.
 *
 * Keys are content-addressed: `{sourceId}/{sha256[0:2]}/{sha256}.pdf`. Two
 * agencies republishing the same announcement link the same bytes, and a
 * re-run re-downloads a file whose content has not changed — content
 * addressing makes both of those free instead of duplicating storage.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface StoredBlob {
  key: string;
  sha256: string;
  size: number;
  /** True when this exact content was already in the store. */
  deduplicated: boolean;
}

export interface BlobStore {
  put(sourceId: string, filename: string, body: Buffer): Promise<StoredBlob>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

export function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

/** Preserve a real extension so the mime type stays inferable from the key. */
function extensionFor(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.bin';
}

export class LocalBlobStore implements BlobStore {
  constructor(private readonly root: string) {}

  async put(sourceId: string, filename: string, body: Buffer): Promise<StoredBlob> {
    const sha256 = sha256Hex(body);
    const key = `${sourceId}/${sha256.slice(0, 2)}/${sha256}${extensionFor(filename)}`;
    const target = this.resolve(key);

    if (await this.exists(key)) {
      return { key, sha256, size: body.length, deduplicated: true };
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write to a temp name then rename, so an interrupted run can never leave
    // a truncated file that later looks like a complete cache hit.
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, body);
    await fs.rename(temp, target);

    return { key, sha256, size: body.length, deduplicated: false };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  /** Reject keys that would escape the storage root. */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    const root = path.resolve(this.root);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Refusing to access a blob key outside the store: ${key}`);
    }
    return target;
  }
}
