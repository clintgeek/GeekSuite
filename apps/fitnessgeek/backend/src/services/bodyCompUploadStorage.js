// Local-disk storage for a validated body-composition scan upload.
//
// Scope note: this is intake plumbing only. It writes the file bytes plus a
// small JSON sidecar of metadata and hands back an id — it does not touch
// Mongoose/`@geeksuite/schemas` (owned by another agent building the real
// storage schema) and does not run any AI extraction (a later step). The
// sidecar exists so that later step has something to read without a DB
// record having to exist first.
//
// Known limitation, flagged rather than silently accepted: fitnessgeek's
// container ships with no bind-mounted data volume (DOCS/RUNBOOK.md §2,
// "Data volumes" — fitnessgeek is listed among the apps with "none
// declared... stateless container"). Whatever this writes lives only in the
// container's writable layer and is lost on recreate (every deploy, every
// Watchtower restart touches the whole fleet per DOCS/RUNBOOK.md's known
// failure modes). That is an accepted tradeoff for this slice: the file
// only needs to survive from "just uploaded" to "the AI extraction step
// picks it up," and today that happens on the same live container. If
// extraction becomes async/delayed, `BODY_COMP_UPLOAD_DIR` should be
// pointed at a real bind mount in `apps/fitnessgeek/docker-compose*.yml` —
// out of this change's file scope, called out for the orchestrator.
//
// The default directory lives under `data/`, which
// `apps/fitnessgeek/.gitignore` already excludes (`data/`, narrowed from a
// broader `*data*` pattern on 2026-09-04 — DOCS memory), so nothing here
// needs a new .gitignore entry.

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { extensionForMimeType } from './fileSniff.js';

function uploadDir() {
  return process.env.BODY_COMP_UPLOAD_DIR
    || path.join(process.cwd(), 'data', 'body-comp-uploads');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Persist a validated upload to disk.
 *
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.mimeType - sniffed, not client-declared
 * @param {string|null} params.originalName - client-declared filename, display-only
 * @param {string} params.userId
 * @returns {Promise<{id: string, mimeType: string, size: number, originalName: string|null, userId: string, storedAt: string}>}
 */
export async function saveUpload({ buffer, mimeType, originalName, userId }) {
  const dir = uploadDir();
  await ensureDir(dir);

  const id = crypto.randomUUID();
  const ext = extensionForMimeType(mimeType);
  const filePath = path.join(dir, `${id}${ext}`);
  await fs.writeFile(filePath, buffer);

  const metadata = {
    id,
    userId,
    mimeType,
    size: buffer.length,
    originalName: originalName || null,
    storedAt: new Date().toISOString(),
    // Relative-to-uploadDir file name, not an absolute path — the sidecar
    // may be read from a different container/mount than the one that wrote
    // it, and an absolute path baked in would be actively misleading then.
    fileName: `${id}${ext}`,
  };
  await fs.writeFile(
    path.join(dir, `${id}.json`),
    JSON.stringify(metadata, null, 2),
  );

  return metadata;
}

/**
 * A bare UUID v4, as `crypto.randomUUID()` produces and `saveUpload` names
 * its files with. `id` reaches this function straight off a URL param, and
 * without this check a caller could walk it (`../../etc/passwd`) into a path
 * outside `uploadDir()` — so the check runs before the id ever touches the
 * filesystem, not after.
 */
const UPLOAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read back a previously stored upload's bytes and metadata, for the
 * extraction step (`bodyCompExtractionService.js`) to hand to aiGeek.
 *
 * Ownership is enforced HERE, not left to the caller: a sidecar whose
 * `userId` does not match reads back as `null`, the same answer as an id
 * that does not exist at all. That is deliberate — a 404 leaks nothing about
 * whether the id belongs to someone else, where a 403 would confirm it does.
 *
 * @param {string} id
 * @param {string} userId - the caller's own id, checked against the sidecar
 * @returns {Promise<{buffer: Buffer, mimeType: string, size: number,
 *   originalName: string|null, userId: string, storedAt: string,
 *   fileName: string} | null>} `null` on a missing, malformed, or
 *   not-this-user's id — never a throw for the ordinary "not found" case.
 */
export async function getUpload(id, userId) {
  if (typeof id !== 'string' || !UPLOAD_ID_RE.test(id)) return null;

  const dir = uploadDir();
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  if (!metadata || metadata.userId !== userId) return null;

  const buffer = await fs.readFile(path.join(dir, metadata.fileName));
  return { ...metadata, buffer };
}
