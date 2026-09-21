import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import {
  compressMarkCaptureJpeg,
  normalizeMarkPhotoCompress,
  DEFAULT_MARK_PHOTO_COMPRESS,
} from './mark-photo-compress';

async function makeJpeg(w: number, h: number, quality = 95): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 40, g: 120, b: 200 },
    },
  })
    .jpeg({ quality })
    .toBuffer();
}

describe('mark photo compress', () => {
  it('normalizeMarkPhotoCompress clamps ranges', () => {
    const n = normalizeMarkPhotoCompress({
      enabled: false,
      maxEdge: 99999,
      quality: 5,
    });
    assert.equal(n.enabled, false);
    assert.equal(n.maxEdge, 1920);
    assert.equal(n.quality, 30);
    assert.deepEqual(normalizeMarkPhotoCompress(null), DEFAULT_MARK_PHOTO_COMPRESS);
  });

  it('compressMarkCaptureJpeg shrinks large snapshots', async () => {
    const input = await makeJpeg(1600, 1200, 95);
    const result = await compressMarkCaptureJpeg(input, {
      enabled: true,
      maxEdge: 720,
      quality: 55,
    });
    assert.equal(result.compressed, true);
    assert.ok(result.bytesOut < result.bytesIn);
    assert.ok(result.buffer.length > 100);
    const meta = await sharp(result.buffer).metadata();
    assert.ok((meta.width || 0) <= 720);
    assert.ok((meta.height || 0) <= 720);
    assert.equal(meta.format, 'jpeg');
  });

  it('compressMarkCaptureJpeg can be disabled', async () => {
    const input = await makeJpeg(400, 300, 90);
    const result = await compressMarkCaptureJpeg(input, { enabled: false });
    assert.equal(result.compressed, false);
    assert.equal(result.bytesOut, result.bytesIn);
    assert.equal(result.buffer.length, input.length);
  });
});
