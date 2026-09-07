import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * AES-256-GCM vault for device admin passwords.
 * Ciphertext format: base64(iv || authTag || ciphertext)
 */
@Injectable()
export class DeviceCredentialVaultService {
  private readonly logger = new Logger(DeviceCredentialVaultService.name);
  private readonly key: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.key = this.resolveKey();
    if (!this.key) {
      this.logger.warn(
        'DEVICE_CREDENTIAL_VAULT_KEY / DEVICE_LINK_KEY / PUNCH_INGEST_API_KEY unset — vault encrypt disabled',
      );
    }
  }

  async setPassword(
    tenantId: string,
    deviceId: string,
    plaintext: string,
    updatedById?: string | null,
  ): Promise<void> {
    const key = this.requireKey();
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Device not found');

    const ciphertext = this.encrypt(plaintext, key);
    await this.prisma.deviceCredentialVault.upsert({
      where: { deviceId },
      create: {
        deviceId,
        tenantId,
        ciphertext,
        keyVersion: 1,
        updatedById: updatedById ?? null,
      },
      update: {
        ciphertext,
        updatedById: updatedById ?? null,
        tenantId,
      },
    });
  }

  async getPassword(tenantId: string, deviceId: string): Promise<string | null> {
    const row = await this.prisma.deviceCredentialVault.findFirst({
      where: { deviceId, tenantId },
    });
    if (!row) return null;
    const key = this.requireKey();
    return this.decrypt(row.ciphertext, key);
  }

  private requireKey(): Buffer {
    if (!this.key) {
      throw new ServiceUnavailableException(
        'Device credential vault key is not configured',
      );
    }
    return this.key;
  }

  private resolveKey(): Buffer | null {
    const raw =
      (this.config.get<string>('DEVICE_CREDENTIAL_VAULT_KEY') ?? '').trim() ||
      (this.config.get<string>('DEVICE_LINK_KEY') ?? '').trim() ||
      (this.config.get<string>('PUNCH_INGEST_API_KEY') ?? '').trim();
    if (!raw) return null;

    const fromHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
    if (fromHex && fromHex.length === 32) return fromHex;

    try {
      const fromB64 = Buffer.from(raw, 'base64');
      if (fromB64.length === 32) return fromB64;
    } catch {
      /* fall through to sha256 derive */
    }

    // Dev fallback: derive 32 bytes from any shared secret string
    return createHash('sha256').update(raw, 'utf8').digest();
  }

  private encrypt(plaintext: string, key: Buffer): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  private decrypt(ciphertextB64: string, key: Buffer): string {
    const buf = Buffer.from(ciphertextB64, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) {
      throw new ServiceUnavailableException('Invalid vault ciphertext');
    }
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  }
}
