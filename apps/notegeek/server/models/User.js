import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'], // Basic email format validation
    index: true, // Index for faster lookups
  },
  passwordHash: {
    type: String,
    required: [true, 'Please provide a password hash'],
    minlength: 6, // Store the hash, but good practice to enforce minimum password length elsewhere
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', UserSchema);

export default User;