import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, readPrefs, wantsNotification } from './notification-prefs';

describe('notification preferences', () => {
  it('maps notification entities to categories', () => {
    assert.equal(categoryOf('advance_request'), 'requests');
    assert.equal(categoryOf('employee'), 'security');
    assert.equal(categoryOf('attendance_arrival'), 'attendance');
    assert.equal(categoryOf('wage-change'), 'documents');
    assert.equal(categoryOf('news'), 'news');
    assert.equal(categoryOf('something-new'), null);
    assert.equal(categoryOf(null), null);
  });

  it('treats every category as on unless explicitly switched off', () => {
    const prefs = readPrefs({ notificationPrefs: { news: false, requests: 'no' } });
    assert.equal(prefs.news, false);
    assert.equal(prefs.requests, true, 'only `false` switches a group off');
    assert.equal(readPrefs(null).security, true);
  });

  it('always delivers notifications outside the categories', () => {
    const meta = { notificationPrefs: { news: false, requests: false, security: false, attendance: false, documents: false } };
    assert.equal(wantsNotification(meta, 'news'), false);
    assert.equal(wantsNotification(meta, undefined), true);
    assert.equal(wantsNotification(meta, 'something-new'), true);
  });
});
