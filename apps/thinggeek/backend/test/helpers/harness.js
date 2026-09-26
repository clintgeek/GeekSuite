/**
 * Test harness: a createApp() over fake models, a throwaway FILES_PATH and an
 * in-process session check (tokens → users) so no Mongo or basegeek is needed.
 * The member gate itself is the REAL one — resolveHouseholdId from
 * @geeksuite/schemas/thinggeek/household.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import mongoose from 'mongoose';
import userServer from '@geeksuite/user/server';
import createApp from '../../src/app.js';
import { createFakeModel } from './fakeModel.js';

const { invalidSession } = userServer;

export const CHEF_ID = '6818c2bddcf626909f6a93a1';
export const HEATHER_ID = '689931bbe8828efb78d11bab';
export const STRANGER_ID = '5f0000000000000000000001';

export const USERS = {
  chef: { id: CHEF_ID, userId: CHEF_ID, username: 'chef', email: 'chef@example.test' },
  heather: { id: HEATHER_ID, userId: HEATHER_ID, username: 'heather' },
  stranger: { id: STRANGER_ID, userId: STRANGER_ID, username: 'stranger' },
};

export const auth = (who) => ({ Authorization: `Bearer ${who}` });

export async function validateSession(token) {
  const user = USERS[token];
  if (!user) throw invalidSession();
  return user;
}

export function makeTempDir(prefix = 'thinggeek-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function newId() {
  return new mongoose.Types.ObjectId();
}

/**
 * @param {object} [seed]
 * @param {object[]} [seed.things]
 * @param {object[]} [seed.files]
 */
export function buildHarness({ things = [], files = [], now, hooks = {} } = {}) {
  const filesPath = makeTempDir();
  const clock = now || (() => new Date());
  const Thing = createFakeModel(things, { now: clock, hooks: hooks.Thing });
  const ThingFile = createFakeModel(files, { now: clock, hooks: hooks.ThingFile });
  const app = createApp({ Thing, ThingFile, filesPath, validateSession, now: clock, publicPath: makeTempDir('thinggeek-public-') });
  return {
    app,
    Thing,
    ThingFile,
    filesPath,
    cleanup() {
      fs.rmSync(filesPath, { recursive: true, force: true });
    },
  };
}

export function liveThing(overrides = {}) {
  return { _id: newId(), householdId: 'default', name: 'Wendy', photos: [], documents: [], relationships: [], deletedAt: null, ...overrides };
}

// ---- fixtures, generated so no binary lives in the repo -----------------

/** A 1000×500 JPEG tagged orientation 6 (display 500×1000) with GPS EXIF. */
export async function jpegWithGps() {
  return sharp({ create: { width: 1000, height: 500, channels: 3, background: '#c33' } })
    .jpeg()
    .withMetadata({
      orientation: 6,
      exif: { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 26/1 46/1', GPSLongitudeRef: 'W', GPSLongitude: '79/1 58/1 56/1' } },
    })
    .toBuffer();
}

export async function pngBuffer(width = 64, height = 32, background = '#3a3') {
  return sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
}

export function pdfBuffer() {
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
}

/** Sniffs as HEIC (ftyp box, 'heic' brand) but sharp cannot decode it. */
export function undecodableHeic() {
  const ftyp = Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp', 'latin1'), Buffer.from('heic', 'latin1'),
    Buffer.from([0, 0, 0, 0]), Buffer.from('mif1heic', 'latin1'),
  ]);
  return Buffer.concat([ftyp, Buffer.alloc(512, 7)]);
}

/** True when an EXIF blob / file carries the GPS IFD pointer (tag 0x8825, either byte order). */
export function hasGpsTag(buf) {
  return Boolean(buf) && (buf.includes(Buffer.from([0x25, 0x88])) || buf.includes(Buffer.from([0x88, 0x25])));
}
