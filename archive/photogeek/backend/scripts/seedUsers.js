const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../src/models/User');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const users = [
  {
    email: 'test@example.com',
    password: 'password123',
    profile: {
      firstName: 'Test',
      lastName: 'User',
      bio: 'I love photography!'
    },
    skillLevel: 'intermediate',
    level: 5,
    xp: 1250
  }
];

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    // Clear existing users
    await User.deleteMany({});
    console.log('Users cleared');

    // Create users
    for (const user of users) {
      await User.create(user);
    }

    console.log('Users seeded successfully');
    process.exit();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

seedUsers();
