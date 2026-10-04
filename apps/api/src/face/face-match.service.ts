import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import type { InferenceSession, Tensor } from 'onnxruntime-node';
import {
  alignForSface,
  cosineSimilarity,
  decodeYunet,
  scaleFace,
  type DetectedFace,
  type YunetOutputs,
} from './face-geometry';

export type FaceEmbedding =
  | { ok: true; embedding: Float32Array; face: DetectedFace; faces: number }
  | { ok: false; reason: 'no_face' | 'bad_image' };

const DETECT_SIZE = 640;
const WORK_MAX_EDGE = 1024;
const SCORE_THRESHOLD = 0.7;
/**
 * Phone selfie vs profile photo. OpenCV's published SFace value (0.363) let look-alike
 * colleagues through on real staff photos; 0.45 keeps strangers out with margin.
 * Override with FACE_MATCH_THRESHOLD (0.3–0.8).
 */
export const FACE_MATCH_THRESHOLD_DEFAULT = 0.45;
const CACHE_LIMIT = 300;

function thresholdFromEnv(): number {
  const raw = Number(process.env.FACE_MATCH_THRESHOLD);
  return Number.isFinite(raw) && raw >= 0.3 && raw <= 0.8 ? raw : FACE_MATCH_THRESHOLD_DEFAULT;
}

/**
 * Face comparison with OpenCV Zoo models: YuNet (MIT) finds the face and its five
 * landmarks, SFace (Apache-2.0) turns the aligned face into a 128-d embedding.
 */
@Injectable()
export class FaceMatchService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FaceMatchService.name);
  private sessions: Promise<{ detector: InferenceSession; recognizer: InferenceSession; ort: typeof import('onnxruntime-node') }> | null = null;
  private readonly cache = new Map<string, FaceEmbedding>();
  readonly threshold = thresholdFromEnv();

  /** Loads the models in the background so the first phone punch does not pay for it. */
  onApplicationBootstrap() {
    setImmediate(() => {
      this.load().catch((e) =>
        this.logger.warn(`Face models not loaded: ${e instanceof Error ? e.message : e}`),
      );
    });
  }

  private modelPath(file: string) {
    const candidates = [
      join(process.cwd(), 'assets', 'models', file),
      join(process.cwd(), 'apps', 'api', 'assets', 'models', file),
      join(__dirname, '..', '..', 'assets', 'models', file),
    ];
    return candidates.find((p) => existsSync(p)) ?? candidates[0];
  }

  private load() {
    if (!this.sessions) {
      this.sessions = (async () => {
        const ort = await import('onnxruntime-node');
        const opts: InferenceSession.SessionOptions = {
          intraOpNumThreads: 2,
          interOpNumThreads: 1,
          logSeverityLevel: 3,
        };
        const [detector, recognizer] = await Promise.all([
          ort.InferenceSession.create(this.modelPath('face_detection_yunet_2023mar.onnx'), opts),
          ort.InferenceSession.create(this.modelPath('face_recognition_sface_2021dec.onnx'), opts),
        ]);
        this.logger.log('Face models loaded');
        return { detector, recognizer, ort };
      })().catch((e) => {
        this.sessions = null;
        throw e;
      });
    }
    return this.sessions;
  }

  async embed(image: Buffer): Promise<FaceEmbedding> {
    let work: { data: Buffer; info: sharp.OutputInfo };
    try {
      work = await sharp(image)
        .rotate()
        .resize(WORK_MAX_EDGE, WORK_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch {
      return { ok: false, reason: 'bad_image' };
    }
    const { width, height } = work.info;
    const { detector, recognizer, ort } = await this.load();

    const factor = DETECT_SIZE / Math.max(width, height);
    const dw = Math.max(1, Math.round(width * factor));
    const dh = Math.max(1, Math.round(height * factor));
    const small = await sharp(work.data, { raw: { width, height, channels: 3 } })
      .resize(dw, dh, { fit: 'fill' })
      .raw()
      .toBuffer();
    const plane = DETECT_SIZE * DETECT_SIZE;
    const input = new Float32Array(3 * plane);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const src = (y * dw + x) * 3;
        const dst = y * DETECT_SIZE + x;
        input[dst] = small[src + 2];
        input[plane + dst] = small[src + 1];
        input[2 * plane + dst] = small[src];
      }
    }
    const detOut = await detector.run({
      [detector.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, DETECT_SIZE, DETECT_SIZE]),
    });
    const heads: YunetOutputs = {};
    for (const [name, tensor] of Object.entries(detOut)) {
      heads[name] = (tensor as Tensor).data as Float32Array;
    }
    const faces = decodeYunet(heads, DETECT_SIZE, SCORE_THRESHOLD);
    if (!faces.length) return { ok: false, reason: 'no_face' };

    const largest = faces.reduce((a, b) => (b.box[2] * b.box[3] > a.box[2] * a.box[3] ? b : a));
    const face = scaleFace(largest, factor);
    const aligned = alignForSface(work.data, width, height, face.landmarks);
    const recOut = await recognizer.run({
      [recognizer.inputNames[0]]: new ort.Tensor('float32', aligned, [1, 3, 112, 112]),
    });
    const embedding = Float32Array.from(
      (recOut[recognizer.outputNames[0]] as Tensor).data as Float32Array,
    );
    return { ok: true, embedding, face, faces: faces.length };
  }

  /** Embeddings of reference photos keyed by their storage key / URL. */
  async embedCached(cacheKey: string, load: () => Promise<Buffer | null>): Promise<FaceEmbedding | null> {
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;
    const image = await load();
    if (!image?.length) return null;
    const result = await this.embed(image);
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(cacheKey, result);
    return result;
  }

  similarity(a: Float32Array, b: Float32Array) {
    return cosineSimilarity(a, b);
  }
}
