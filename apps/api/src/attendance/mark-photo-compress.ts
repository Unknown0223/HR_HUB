import sharp from 'sharp';

export type MarkPhotoCompressOpts = {
  /** When false, store original bytes (still validated as JPEG). */
  enabled: boolean;
  /** Longest side in pixels (default 720). */
  maxEdge: number;
  /** JPEG quality 1–100 (default 62). */
  quality: number;
};

export const DEFAULT_MARK_PHOTO_COMPRESS: MarkPhotoCompressOpts = {
  enabled: true,
  maxEdge: 720,
  quality: 62,
};

export function normalizeMarkPhotoCompress(raw: unknown): MarkPhotoCompressOpts {
  const d = DEFAULT_MARK_PHOTO_COMPRESS;
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const maxEdge = Math.min(
    1920,
    Math.max(
      240,
      Math.floor(
        Number.isFinite(Number(o.maxEdge)) ? Number(o.maxEdge) : d.maxEdge,
      ),
    ),
  );
  const quality = Math.min(
    95,
    Math.max(
      30,
      Math.floor(
        Number.isFinite(Number(o.quality)) ? Number(o.quality) : d.quality,
      ),
    ),
  );
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    maxEdge,
    quality,
  };
}

/**
 * Downscale + re-encode terminal punch snapshots before MinIO.
 * Falls back to original buffer if decode/re-encode fails.
 */
export async function compressMarkCaptureJpeg(
  input: Buffer,
  opts: Partial<MarkPhotoCompressOpts> = {},
): Promise<{ buffer: Buffer; compressed: boolean; bytesIn: number; bytesOut: number }> {
  const cfg = normalizeMarkPhotoCompress({ ...DEFAULT_MARK_PHOTO_COMPRESS, ...opts });
  const bytesIn = input.length;
  if (!cfg.enabled || bytesIn < 100) {
    return { buffer: input, compressed: false, bytesIn, bytesOut: bytesIn };
  }

  try {
    const out = await sharp(input, { failOn: 'none' })
      .rotate() // honour EXIF orientation from cameras
      .resize({
        width: cfg.maxEdge,
        height: cfg.maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: cfg.quality,
        mozjpeg: true,
        chromaSubsampling: '4:2:0',
      })
      .toBuffer();

    // Keep original only if somehow larger after encode (rare for huge JPEG).
    if (out.length > 0 && out.length < bytesIn) {
      return { buffer: out, compressed: true, bytesIn, bytesOut: out.length };
    }
    if (out.length > 0 && bytesIn > 80_000) {
      // Still prefer re-encoded (normalized) when input was huge progressive JPEG.
      return { buffer: out, compressed: true, bytesIn, bytesOut: out.length };
    }
    return { buffer: out.length > 0 ? out : input, compressed: out.length > 0, bytesIn, bytesOut: (out.length || bytesIn) };
  } catch {
    return { buffer: input, compressed: false, bytesIn, bytesOut: bytesIn };
  }
}
