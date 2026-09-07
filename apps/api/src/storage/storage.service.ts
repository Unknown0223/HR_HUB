import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT') || 'localhost';
    const port = this.config.get<string>('MINIO_PORT') || '9000';
    const accessKey =
      this.config.get<string>('MINIO_ACCESS_KEY') || 'minioadmin';
    const secretKey =
      this.config.get<string>('MINIO_SECRET_KEY') || 'minioadmin';
    this.bucket = this.config.get<string>('MINIO_BUCKET') || 'hrhub';

    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: `http://${endpoint}:${port}`,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    try {
      await this.ensureBucket();
      this.ready = true;
      this.logger.log(`MinIO ready bucket=${this.bucket}`);
    } catch (e) {
      this.ready = false;
      this.logger.warn(`MinIO unavailable — face photos stored as data-URL fallback: ${e}`);
    }
  }

  get isReady() {
    return this.ready;
  }

  private async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    if (!this.ready) {
      return { key, url: `data:${contentType};base64,${body.toString('base64')}` };
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: 60 * 60 * 24 * 7 },
    );
    return { key, url };
  }

  async getObjectBuffer(key: string): Promise<Buffer | null> {
    if (!this.ready) return null;
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!res.Body) return null;
      return await this.streamToBuffer(res.Body as Readable);
    } catch {
      return null;
    }
  }

  isSafeKey(key: string): boolean {
    const k = (key || '').replace(/^\/+/, '');
    if (!k || k.includes('..') || k.length > 512) return false;
    return /^(faces|marks)\/[A-Za-z0-9._\-/]+$/.test(k);
  }

  /** faces/{tenantId}/… or marks/{tenantId}/… — second path segment is the company id. */
  tenantIdFromKey(key: string): string | null {
    const k = (key || '').replace(/^\/+/, '');
    if (!this.isSafeKey(k)) return null;
    const tenantId = k.split('/')[1];
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      return null;
    }
    return tenantId;
  }

  extractKeyFromUrl(url: string): string | null {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts[0] === this.bucket ? 1 : 0;
      const key = parts.slice(idx).join('/');
      return this.isSafeKey(key) ? key : null;
    } catch {
      return null;
    }
  }

  proxyUrl(key: string): string {
    const port = this.config.get<string>('API_PORT') || '3002';
    const railway =
      this.config.get<string>('RAILWAY_PUBLIC_DOMAIN') ||
      this.config.get<string>('RAILWAY_STATIC_URL');
    const base = (
      this.config.get<string>('API_PUBLIC_URL') ||
      (railway ? `https://${railway.replace(/^https?:\/\//, '')}` : null) ||
      `http://localhost:${port}`
    ).replace(/\/$/, '');
    return `${base}/api/storage/file?key=${encodeURIComponent(key)}`;
  }

  /** Stable URL for <img src> — avoids expired MinIO signatures. */
  mediaUrl(photoKey?: string | null, photoUrl?: string | null): string | null {
    if (photoUrl?.startsWith('data:') || photoUrl?.startsWith('blob:')) {
      return photoUrl;
    }
    // Prefer proxy when we have a key (controller falls back / redirects if object missing).
    if (photoKey && this.isSafeKey(photoKey)) {
      return this.proxyUrl(photoKey);
    }
    if (!photoUrl) return null;
    const fromSigned = this.extractKeyFromUrl(photoUrl);
    if (fromSigned) return this.proxyUrl(fromSigned);
    return photoUrl;
  }

  async getSignedGetUrl(key: string, expiresIn = 3600) {
    if (!this.ready) return null;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  /** Soft-delete object from MinIO; no-op if storage unavailable or key missing. */
  async deleteObject(key: string | null | undefined): Promise<boolean> {
    if (!key || !this.ready) return false;
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (e) {
      this.logger.warn(`MinIO delete failed key=${key}: ${e}`);
      return false;
    }
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
