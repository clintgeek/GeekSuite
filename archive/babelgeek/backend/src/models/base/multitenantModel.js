import mongoose from "mongoose";

export const multitenantSchema = (baseSchema) => {
  const schema = new mongoose.Schema(baseSchema, { timestamps: true });

  schema.add({
    ownerId: { type: String, required: true, index: true },
    deletedAt: { type: Date, default: null, index: true }
  });

  // query helper to exclude deleted
  schema.query.notDeleted = function () {
    return this.where({ deletedAt: null });
  };

  schema.statics.withDeleted = function () {
    return this.where({});
  };

  return schema;
};
