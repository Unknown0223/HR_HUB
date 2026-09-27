import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  retentionToDays,
  mergeMarkPhotosSettings,
  markPhotoKindFromDirection,
  markPhotoKindFromMarkType,
  mergeSystemSettings,
  DEFAULT_MARK_PHOTOS_SETTINGS,
} from './system-settings.defaults';

describe('markPhotos retention helpers', () => {
  it('retentionToDays converts units', () => {
    assert.equal(retentionToDays(1, 'day'), 1);
    assert.equal(retentionToDays(2, 'month'), 60);
    assert.equal(retentionToDays(1, 'year'), 365);
    assert.equal(retentionToDays(0, 'day'), 0);
    assert.equal(retentionToDays(-3, 'day'), 0);
    assert.equal(retentionToDays('3', 'DAY'), 3);
    assert.equal(retentionToDays(null, 'day'), 0);
  });

  it('mergeMarkPhotosSettings fills defaults', () => {
    const m = mergeMarkPhotosSettings({
      out: { enabled: false, retentionValue: 1, retentionUnit: 'year' },
    });
    assert.equal(m.in.enabled, true);
    assert.equal(m.out.enabled, false);
    assert.equal(m.out.retentionValue, 1);
    assert.equal(m.out.retentionUnit, 'year');
    assert.equal(m.mark.retentionUnit, 'day');
    assert.equal(m.estimated_out.enabled, true);
  });

  it('mergeMarkPhotosSettings clamps bad units and values', () => {
    const m = mergeMarkPhotosSettings({
      in: { enabled: 'yes', retentionValue: -5, retentionUnit: 'week' },
      mark: { retentionValue: 2.9, retentionUnit: 'month' },
    });
    assert.equal(m.in.enabled, true); // non-boolean falls back
    assert.equal(m.in.retentionValue, 0);
    assert.equal(m.in.retentionUnit, 'day');
    assert.equal(m.mark.retentionValue, 2);
    assert.equal(m.mark.retentionUnit, 'month');
  });

  it('markPhotoKindFromDirection maps punch directions', () => {
    assert.equal(markPhotoKindFromDirection('IN'), 'in');
    assert.equal(markPhotoKindFromDirection('OUT'), 'out');
    assert.equal(markPhotoKindFromDirection('AUTO'), 'mark');
    assert.equal(markPhotoKindFromDirection(null), 'mark');
    assert.equal(markPhotoKindFromDirection('in'), 'in');
  });

  it('markPhotoKindFromMarkType maps примерный уход', () => {
    assert.equal(markPhotoKindFromMarkType('estimated_out'), 'estimated_out');
    assert.equal(markPhotoKindFromMarkType('Примерный уход'), 'estimated_out');
    assert.equal(markPhotoKindFromMarkType('промежуточный уход'), 'estimated_out');
    assert.equal(markPhotoKindFromMarkType('in', 'OUT'), 'in');
    assert.equal(markPhotoKindFromMarkType(null, 'OUT'), 'out');
  });

  it('mergeSystemSettings includes markPhotos defaults', () => {
    const s = mergeSystemSettings({});
    assert.deepEqual(s.markPhotos, DEFAULT_MARK_PHOTOS_SETTINGS);
    assert.equal(s.markPhotos.in.enabled, true);
    assert.equal(s.markPhotos.out.retentionValue, 90);
    assert.equal(s.markPhotos.estimated_out.enabled, true);
    assert.equal(s.markPhotos.compress.enabled, true);
    assert.equal(s.markPhotos.compress.maxEdge, 720);
    assert.equal(s.markPhotos.compress.quality, 62);
  });

  it('mergeSystemSettings round-trips partial markPhotos patch', () => {
    const s = mergeSystemSettings({
      markPhotos: {
        out: { enabled: false, retentionValue: 6, retentionUnit: 'month' },
        estimated_out: { enabled: false, retentionValue: 7, retentionUnit: 'day' },
        compress: { enabled: true, maxEdge: 480, quality: 50 },
      },
    });
    assert.equal(s.markPhotos.out.enabled, false);
    assert.equal(s.markPhotos.compress.maxEdge, 480);
    assert.equal(s.markPhotos.compress.quality, 50);
    assert.equal(s.markPhotos.estimated_out.enabled, false);
  });

  it('deep-merge keeps existing markPhotos kinds when patching one kind', () => {
    const existing = mergeSystemSettings({
      markPhotos: {
        in: { enabled: true, retentionValue: 45, retentionUnit: 'day' },
        out: { enabled: false, retentionValue: 10, retentionUnit: 'month' },
        mark: { enabled: true, retentionValue: 14, retentionUnit: 'day' },
        estimated_out: { enabled: true, retentionValue: 3, retentionUnit: 'day' },
        compress: { enabled: true, maxEdge: 720, quality: 62 },
      },
    });
    const patch = {
      markPhotos: {
        out: { enabled: true, retentionValue: 20, retentionUnit: 'day' },
        compress: { quality: 55 },
      },
    };
    const pr = patch.markPhotos as Record<string, unknown>;
    const ex = existing.markPhotos;
    const kind = (key: 'in' | 'out' | 'mark' | 'estimated_out') => ({
      ...ex[key],
      ...((pr[key] && typeof pr[key] === 'object' ? pr[key] : {}) as object),
    });
    const merged = mergeSystemSettings({
      ...existing,
      ...patch,
      markPhotos: {
        in: kind('in'),
        out: kind('out'),
        mark: kind('mark'),
        estimated_out: kind('estimated_out'),
        compress: {
          ...ex.compress,
          ...((pr.compress && typeof pr.compress === 'object'
            ? pr.compress
            : {}) as object),
        },
      },
    });
    assert.equal(merged.markPhotos.in.retentionValue, 45);
    assert.equal(merged.markPhotos.out.enabled, true);
    assert.equal(merged.markPhotos.out.retentionValue, 20);
    assert.equal(merged.markPhotos.estimated_out.retentionValue, 3);
    assert.equal(merged.markPhotos.compress.maxEdge, 720);
    assert.equal(merged.markPhotos.compress.quality, 55);
  });

  it('mergeDocumentTypeNotifications normalizes rules', () => {
    const s = mergeSystemSettings({
      hrNotifyDocumentDates: true,
      documentTypeNotifications: {
        enabled: true,
        rules: [
          {
            id: 'r1',
            documentTypeCode: 'passport',
            daysBefore: 14,
            enabled: true,
          },
          { documentTypeCode: '', daysBefore: 5 },
        ],
      },
    });
    assert.equal(s.documentTypeNotifications.enabled, true);
    assert.equal(s.hrNotifyDocumentDates, true);
    assert.equal(s.documentTypeNotifications.rules.length, 1);
    assert.equal(s.documentTypeNotifications.rules[0].documentTypeCode, 'PASSPORT');
    assert.equal(s.documentTypeNotifications.rules[0].daysBefore, 14);
  });

  it('legacy hrNotifyDocumentDates enables nested documentTypeNotifications', () => {
    const s = mergeSystemSettings({
      hrNotifyDocumentDates: true,
    });
    assert.equal(s.documentTypeNotifications.enabled, true);
    assert.equal(s.hrNotifyDocumentDates, true);
  });

  it('policy gate: disabled out means discard out photos only', () => {
    const s = mergeSystemSettings({
      markPhotos: {
        in: { enabled: true, retentionValue: 30, retentionUnit: 'day' },
        out: { enabled: false, retentionValue: 30, retentionUnit: 'day' },
        mark: { enabled: true, retentionValue: 30, retentionUnit: 'day' },
        estimated_out: { enabled: false, retentionValue: 30, retentionUnit: 'day' },
      },
    });
    const allow = (dir: string) =>
      Boolean(s.markPhotos[markPhotoKindFromDirection(dir)]?.enabled);
    assert.equal(allow('IN'), true);
    assert.equal(allow('OUT'), false);
    assert.equal(allow('AUTO'), true);
    assert.equal(s.markPhotos[markPhotoKindFromMarkType('estimated_out')]?.enabled, false);
  });

  it('purge cutoffs skip forever (0 days) policies', () => {
    const s = mergeSystemSettings({
      markPhotos: {
        in: { enabled: true, retentionValue: 0, retentionUnit: 'day' },
        out: { enabled: true, retentionValue: 1, retentionUnit: 'day' },
        mark: { enabled: true, retentionValue: 1, retentionUnit: 'year' },
        estimated_out: { enabled: true, retentionValue: 0, retentionUnit: 'day' },
      },
    });
    const now = Date.UTC(2026, 8, 19, 12, 0, 0);
    const cutoffs: Record<string, number | null> = {};
    for (const kind of ['in', 'out', 'mark', 'estimated_out'] as const) {
      const days = retentionToDays(
        s.markPhotos[kind].retentionValue,
        s.markPhotos[kind].retentionUnit,
      );
      cutoffs[kind] = days >= 1 ? now - days * 86400000 : null;
    }
    assert.equal(cutoffs.in, null);
    assert.equal(cutoffs.estimated_out, null);
    assert.ok(cutoffs.out != null);
    assert.equal(cutoffs.out, now - 86400000);
    assert.equal(cutoffs.mark, now - 365 * 86400000);
  });
});
