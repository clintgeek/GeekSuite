/**
 * ThingFile — the record for a stored photo or document; the bytes live on
 * disk under FILES_PATH. Written by this backend only; the gateway reads it
 * for URLs and metadata. Collection `files` (DOCS/THINGGEEK_PLAN.md
 * "thinggeek.files").
 */
import mongoose from 'mongoose';
import fileModule from '@geeksuite/schemas/thinggeek/file';

const { createFileSchema } = fileModule;

export default mongoose.models.ThingFile || mongoose.model('ThingFile', createFileSchema(mongoose), 'files');
