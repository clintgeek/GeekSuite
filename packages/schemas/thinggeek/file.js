/**
 * thinggeek `ThingFile` — a stored photo or document (bytes live on disk
 * under FILES_PATH; this is the record). Written by the backend only; the
 * gateway reads it to resolve URLs and metadata.
 */
const { FILE_KINDS } = require('./constants.js');

function fileDefinition() {
  return {
    householdId: { type: String, required: true },
    kind: { type: String, enum: FILE_KINDS, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    path: { type: String, required: true },       // relative to FILES_PATH
    thumbPath: { type: String, default: null },   // relative to FILES_PATH
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    originalName: { type: String, maxlength: 255, default: '' },
    uploadedBy: { type: String, default: null },
  };
}

function createFileSchema(mongoose) {
  const schema = new mongoose.Schema(fileDefinition(), { timestamps: true });
  schema.index({ householdId: 1, sha256: 1 });
  return schema;
}

module.exports = { fileDefinition, createFileSchema };
