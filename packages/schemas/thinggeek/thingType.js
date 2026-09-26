/**
 * thinggeek `ThingType` — the schema for a Thing's `attributes`, as
 * household-editable DATA (not code). `identifier` fields are masked in the
 * UI until revealed and never reach an AI provider. `kind` decides whether
 * its things are inventory and whether they are offered as "where it is".
 */
const { FIELD_KINDS, THING_KINDS, DEFAULT_THING_KIND, bounds } = require('./constants.js');

function thingTypeDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new TypeError('@geeksuite/schemas/thinggeek/thingType: pass your own mongoose instance');
  const { Schema } = mongoose;
  return {
    householdId: { type: String, required: true },
    key: { type: String, required: true, maxlength: 60 },       // stable slug, unique per household
    name: { type: String, required: true, maxlength: 80 },
    icon: { type: String, maxlength: 60, default: 'Inventory2' }, // MUI icon name
    // Its things' role in the containment graph: location | container | item.
    kind: { type: String, enum: THING_KINDS, default: DEFAULT_THING_KIND },
    fields: {
      type: [new Schema({
        key: { type: String, required: true, maxlength: 60 },     // attribute key, stable
        label: { type: String, required: true, maxlength: 80 },
        kind: { type: String, enum: FIELD_KINDS, required: true },
        choices: { type: [String], default: [] },
        unit: { type: String, maxlength: 20, default: null },
        identifier: { type: Boolean, default: false },
        required: { type: Boolean, default: false },
      }, { _id: false })],
      default: [],
      validate: { validator: (v) => v.length <= bounds.fieldsMax.max, message: 'too many fields' },
    },
    builtIn: { type: Boolean, default: false },
  };
}

function createThingTypeSchema(mongoose) {
  const schema = new mongoose.Schema(thingTypeDefinition(mongoose), { timestamps: true });
  schema.index({ householdId: 1, key: 1 }, { unique: true });
  return schema;
}

module.exports = { thingTypeDefinition, createThingTypeSchema };
