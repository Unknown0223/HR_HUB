import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertVideoPunch, parsePunchVideoSettings, pickDayCode } from './punch-video';

describe('punch video settings', () => {
  it('defaults off', () => {
    const s = parsePunchVideoSettings(null);
    assert.equal(s.enabled, false);
    assert.equal(s.codeRequired, true);
    assert.equal(s.chatId, '');
  });

  it('reads extras.punchVideo', () => {
    const s = parsePunchVideoSettings({ punchVideo: { enabled: true, codeRequired: false, chatId: ' -1001 ' } });
    assert.equal(s.enabled, true);
    assert.equal(s.codeRequired, false);
    assert.equal(s.chatId, '-1001');
  });
});

describe('punch video checks', () => {
  const base = { durationSec: 8, bytes: 80_000, enabled: true, codeRequired: true, code: 173, spokenCode: 173 };

  it('accepts a matching clip', () => {
    assert.equal(assertVideoPunch(base).ok, true);
  });

  it('rejects when the feature is off, the clip is short, or the code differs', () => {
    assert.equal(assertVideoPunch({ ...base, enabled: false }).code, 'PUNCH_VIDEO_DISABLED');
    assert.equal(assertVideoPunch({ ...base, durationSec: 3 }).code, 'PUNCH_VIDEO_DURATION');
    assert.equal(assertVideoPunch({ ...base, spokenCode: 100 }).code, 'PUNCH_VIDEO_CODE');
    assert.equal(assertVideoPunch({ ...base, codeRequired: false, spokenCode: undefined }).ok, true);
  });
});

describe('day code', () => {
  it('skips codes already given today', () => {
    const used = new Set([1, 2, 3]);
    const code = pickDayCode(used, () => 0);
    assert.equal(code, 100);
  });

  it('returns null when every code from 100 to 999 is taken', () => {
    const used = new Set(Array.from({ length: 900 }, (_, i) => i + 100));
    assert.equal(pickDayCode(used), null);
  });
});
