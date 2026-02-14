import mongoose from 'mongoose';

const databaseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['mongodb', 'postgresql']
  },
  host: {
    type: String,
    required: true
  },
  port: {
    type: Number,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
databaseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Database = mongoose.model('Database', databaseSchema);

export default Database;