/**
 * thinggeek `Thing` — one owned item. Single source of truth for both writers
 * (basegeek gateway: all plain data; thinggeek backend: files + exports).
 * DOCS/THINGGEEK_PLAN.md "Data model".
 *
 * `attributes` is validated against the item's ThingType by the WRITERS (the
 * gateway's validation), not by mongoose — the type is data, not code.
 */
const { DATE_KINDS, PHOTO_ROLES, DOCUMENT_ROLES, RELATIONSHIP_KINDS, bounds } = require('./constants.js');

function thingDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new TypeError('@geeksuite/schemas/thinggeek/thing: pass your own mongoose instance');
  const { Schema } = mongoose;
  const money = { amount: { type: Number, min: 0, default: null }, currency: { type: String, default: 'USD' } };

  return {
    householdId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: bounds.name.maxlength },
    sortName: { type: String, default: '' },
    typeId: { type: Schema.Types.ObjectId, default: null },
    tags: { type: [String], default: [] },
    placeId: { type: Schema.Types.ObjectId, default: null },
    acquired: {
      date: { type: Date, default: null },         // calendar date, UTC midnight
      from: { type: String, maxlength: 200, default: '' },
      price: { ...money },
    },
    value: { ...money, asOf: { type: Date, default: null } }, // calendar date
    dates: {
      type: [new Schema({
        kind: { type: String, enum: DATE_KINDS, required: true },
        label: { type: String, maxlength: 120, default: '' },
        date: { type: Date, required: true },          // calendar date
        recurEveryMonths: { type: Number, min: 1, max: 120, default: null },
        notes: { type: String, maxlength: 1000, default: '' },
      }, { _id: true })],
      default: [],
    },
    attributes: { type: Schema.Types.Mixed, default: {} },
    photos: {
      type: [new Schema({
        fileId: { type: Schema.Types.ObjectId, required: true },
        role: { type: String, enum: PHOTO_ROLES, default: 'overview' },
        caption: { type: String, maxlength: 300, default: '' },
      }, { _id: true })],
      default: [],
    },
    documents: {
      type: [new Schema({
        fileId: { type: Schema.Types.ObjectId, required: true },
        role: { type: String, enum: DOCUMENT_ROLES, default: 'other' },
        title: { type: String, maxlength: 200, default: '' },
      }, { _id: true })],
      default: [],
    },
    relationships: {
      type: [new Schema({
        kind: { type: String, enum: RELATIONSHIP_KINDS, required: true },
        thingId: { type: Schema.Types.ObjectId, required: true },
      }, { _id: true })],
      default: [],
    },
    notes: { type: String, maxlength: bounds.notes.maxlength, default: '' },
    createdBy: { type: String, default: null },
    // Soft delete: a deleted Thing sits in Trash for TRASH_DAYS, then the
    // backend purges it and its files. Insurance records must survive an
    // accidental delete. Every normal query filters deletedAt: null.
    deletedAt: { type: Date, default: null },
  };
}

function computeSortName(name) {
  const t = String(name || '').trim();
  const m = t.match(/^(the|a|an)\s+(.+)$/i);
  return (m ? `${m[2]}, ${m[1]}` : t).toLowerCase();
}

function createThingSchema(mongoose) {
  const schema = new mongoose.Schema(thingDefinition(mongoose), { timestamps: true, minimize: false });
  schema.pre('validate', function thingDerived(next) {
    if (this.isModified('name') || !this.sortName) this.sortName = computeSortName(this.name);
    next();
  });
  // Every index leads with the tenant.
  schema.index({ householdId: 1, sortName: 1 });
  schema.index({ householdId: 1, typeId: 1 });
  schema.index({ householdId: 1, placeId: 1 });
  schema.index({ householdId: 1, tags: 1 });
  schema.index({ householdId: 1, 'dates.date': 1 });
  schema.index({ householdId: 1, 'relationships.thingId': 1 });
  schema.index({ householdId: 1, createdAt: -1 });
  schema.index({ householdId: 1, deletedAt: 1 });
  return schema;
}

module.exports = { thingDefinition, createThingSchema, computeSortName };
