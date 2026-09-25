/**
 * `resolveCoverPath` is the one thing standing between a cover route and
 * writing/reading outside COVERS_PATH. In real routes `gameId` is always a
 * validated Mongo ObjectId and `ext` always one of imageSniff's three
 * values, so a traversal attempt can't reach this function today — this
 * test proves the guard would still hold if that ever changed (a route
 * refactor that forgot the ObjectId check, a stored `coverPath` value that
 * got corrupted), not that it's reachable now.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCoverPath } from '../src/lib/coverStorage.js';

describe('resolveCoverPath', () => {
  let coversDir;

  beforeEach(() => {
    coversDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamegeek-covers-'));
    process.env.COVERS_PATH = coversDir;
  });

  afterEach(() => {
    fs.rmSync(coversDir, { recursive: true, force: true });
    delete process.env.COVERS_PATH;
  });

  test('resolves a normal id + ext inside the covers directory', () => {
    const p = resolveCoverPath('507f1f77bcf86cd799439011', 'jpg');
    assert.equal(p, path.join(path.resolve(coversDir), '507f1f77bcf86cd799439011.jpg'));
  });

  test('throws rather than escaping via a traversal id', () => {
    assert.throws(() => resolveCoverPath('../../etc/passwd', 'jpg'));
  });

  test('throws rather than escaping via a traversal ext', () => {
    assert.throws(() => resolveCoverPath('507f1f77bcf86cd799439011', '../../../etc/passwd'));
  });

  test('throws on an absolute-path id', () => {
    assert.throws(() => resolveCoverPath('/etc/passwd', 'jpg'));
  });
});
