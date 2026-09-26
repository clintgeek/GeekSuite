/** thinggeek `Place` — a tree (House › Garage › Shelf 2). */
function placeDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new TypeError('@geeksuite/schemas/thinggeek/place: pass your own mongoose instance');
  const { Schema } = mongoose;
  return {
    householdId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    parentId: { type: Schema.Types.ObjectId, default: null },
    notes: { type: String, maxlength: 2000, default: '' },
  };
}

function createPlaceSchema(mongoose) {
  const schema = new mongoose.Schema(placeDefinition(mongoose), { timestamps: true });
  schema.index({ householdId: 1, parentId: 1, name: 1 });
  return schema;
}

module.exports = { placeDefinition, createPlaceSchema };
