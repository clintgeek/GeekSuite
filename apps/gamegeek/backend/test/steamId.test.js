import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSteamIdInput } from '../src/steam/steamId.js';

describe('parseSteamIdInput', () => {
  test('a bare 17-digit SteamID64', () => {
    assert.deepEqual(parseSteamIdInput('76561197960287930'), { type: 'id64', value: '76561197960287930' });
  });

  test('a profiles/ URL carrying a SteamID64', () => {
    assert.deepEqual(
      parseSteamIdInput('https://steamcommunity.com/profiles/76561197960287930'),
      { type: 'id64', value: '76561197960287930' },
    );
    assert.deepEqual(
      parseSteamIdInput('steamcommunity.com/profiles/76561197960287930/'),
      { type: 'id64', value: '76561197960287930' },
    );
  });

  test('an id/ URL carrying a vanity name', () => {
    assert.deepEqual(
      parseSteamIdInput('https://steamcommunity.com/id/chefsage'),
      { type: 'vanity', value: 'chefsage' },
    );
    assert.deepEqual(
      parseSteamIdInput('steamcommunity.com/id/chefsage/'),
      { type: 'vanity', value: 'chefsage' },
    );
  });

  test('a bare vanity name', () => {
    assert.deepEqual(parseSteamIdInput('chefsage'), { type: 'vanity', value: 'chefsage' });
    assert.deepEqual(parseSteamIdInput('Chef_Sage-2'), { type: 'vanity', value: 'Chef_Sage-2' });
  });

  test('a 16 or 18 digit number is not a valid id64 — read as a vanity name instead', () => {
    // Steam vanity names can themselves be all-digits; only exactly 17 is id64.
    const sixteen = parseSteamIdInput('1234567890123456');
    assert.equal(sixteen.type, 'vanity');
    const eighteen = parseSteamIdInput('123456789012345678');
    assert.equal(eighteen.type, 'vanity');
  });

  test('empty, whitespace, or non-string input -> null', () => {
    assert.equal(parseSteamIdInput(''), null);
    assert.equal(parseSteamIdInput('   '), null);
    assert.equal(parseSteamIdInput(null), null);
    assert.equal(parseSteamIdInput(undefined), null);
    assert.equal(parseSteamIdInput(12345), null);
  });

  test('garbage with disallowed characters -> null', () => {
    assert.equal(parseSteamIdInput('not a steam id!!'), null);
    assert.equal(parseSteamIdInput('a'), null); // below the 2-char minimum
  });
});
