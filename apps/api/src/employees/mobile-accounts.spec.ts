import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { suggestLogin, temporaryPassword } from './mobile-accounts.service';

describe('mobile-accounts', () => {
  it('builds firstname.lastname from a Latin FIO', () => {
    assert.equal(suggestLogin('Ilhomov Nurmuhammad Madaminjon', '3860571'), 'nurmuhammad.ilhomov');
  });

  it('transliterates Uzbek Cyrillic and drops apostrophes', () => {
    assert.equal(suggestLogin('Мелибаев Бахтиёржон Мухсинович', '1'), 'baxtiyorjon.melibaev');
    assert.equal(suggestLogin("G'ulomov O'tkir", '1'), 'otkir.gulomov');
  });

  it('falls back to the tab number when the name gives no valid login', () => {
    assert.equal(suggestLogin('Ли', 'SMK-MUPFC6TU'), 'empsmkmupfc6tu');
  });

  it('issues 6-digit numeric one-time passwords', () => {
    for (let i = 0; i < 200; i++) assert.match(temporaryPassword(), /^\d{6}$/);
  });
});
