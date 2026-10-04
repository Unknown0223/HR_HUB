import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDataUrl, photoRef } from './photo-ref';

describe('photoRef', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const data = `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`;

  it('replaces an inline photo with a short versioned link', () => {
    const ref = photoRef(id, data);
    assert.match(ref!, new RegExp(`^/api/me/photos/${id}\\?v=[0-9a-f]{12}$`));
  });

  it('changes the version when the photo changes', () => {
    const other = `data:image/jpeg;base64,${Buffer.from('other').toString('base64')}`;
    assert.notEqual(photoRef(id, data), photoRef(id, other));
  });

  it('keeps regular links and empty values as they are', () => {
    assert.equal(photoRef(id, 'https://cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
    assert.equal(photoRef(id, null), null);
  });
});

describe('decodeDataUrl', () => {
  it('decodes base64 data URLs with their content type', () => {
    const r = decodeDataUrl(`data:image/png;base64,${Buffer.from('png').toString('base64')}`);
    assert.equal(r?.contentType, 'image/png');
    assert.equal(r?.body.toString(), 'png');
  });

  it('returns null for anything else', () => {
    assert.equal(decodeDataUrl('https://cdn.example/a.jpg'), null);
  });
});
