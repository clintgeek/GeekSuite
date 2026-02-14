const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('../src/models/User');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const checkUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    const users = await User.find({});
    console.log(`Found ${ users.length } users:`);

    for (const user of users) {
      console.log(`- Email: ${ user.email }, ID: ${ user._id }`);
      // Try to compare with a common password 'password123'
      const isMatch = await user.comparePassword('password123');
      console.log(`  Matches 'password123': ${ isMatch }`);
    }

    process.exit();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkUsers();
