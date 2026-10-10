/**
 * newsgeek `Place` — the gazetteer: towns, counties, regions. Data, not code.
 * Sources declare the places they cover; articles inherit those and add any
 * place named in their title or excerpt (matched on `name` + `aliases`).
 * Collection `newsgeek.places`.
 */
const { PLACE_KINDS } = require('./constants.js');

function placeDefinition(mongoose) {
  return {
    slug: { type: String, required: true, maxlength: 80 },   // 'clark-county-ar'
    name: { type: String, required: true, maxlength: 120 },
    kind: { type: String, enum: PLACE_KINDS, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    aliases: { type: [String], default: [] },
    fips: { type: String, default: null },
  };
}

function createPlaceSchema(mongoose) {
  const schema = new mongoose.Schema(placeDefinition(mongoose), { timestamps: true });
  schema.index({ slug: 1 }, { unique: true });
  schema.index({ parentId: 1 });
  return schema;
}

module.exports = { placeDefinition, createPlaceSchema };
