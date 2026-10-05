import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeDevice } from './device-label';
import { isDeliverableEmail } from '../mail/mail.service';
import { hashSecret, newSecret } from '../telegram/telegram-links.service';

describe('describeDevice', () => {
  it('names browser and OS', () => {
    assert.equal(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36',
      ),
      'Chrome · Windows',
    );
    assert.equal(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36 Edg/154.0',
      ),
      'Edge · Windows',
    );
    assert.equal(
      describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1'),
      'Safari · iOS',
    );
  });

  it('recognises the mobile app and missing agents', () => {
    assert.equal(describeDevice('Dart/3.12 (dart:io)'), 'Worklyn ilovasi');
    assert.equal(describeDevice(null), 'noma’lum qurilma');
  });
});

describe('isDeliverableEmail', () => {
  it('rejects generated login-only addresses', () => {
    assert.equal(isDeliverableEmail('ali@akfa.local'), false);
    assert.equal(isDeliverableEmail('ali@akfa'), false);
    assert.equal(isDeliverableEmail(''), false);
    assert.equal(isDeliverableEmail(null), false);
  });

  it('accepts real mailboxes', () => {
    assert.equal(isDeliverableEmail('ali.valiyev@gmail.com'), true);
    assert.equal(isDeliverableEmail(' HR@Company.uz '), true);
  });
});

describe('one-time secrets', () => {
  it('are url-safe, unique and stored as sha256', () => {
    const a = newSecret();
    const b = newSecret();
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9_-]{32}$/);
    assert.match(hashSecret(a), /^[0-9a-f]{64}$/);
    assert.equal(hashSecret(a), hashSecret(a));
  });
});
