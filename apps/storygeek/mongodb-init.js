// MongoDB initialization script for StoryGeek
// This script runs when the MongoDB container starts for the first time

db = db.getSiblingDB('storygeek');

// Create collections
db.createCollection('stories');
db.createCollection('users');

// Create indexes for better performance
db.stories.createIndex({ "userId": 1, "status": 1 });

db.stories.createIndex({ "createdAt": -1 });
db.stories.createIndex({ "updatedAt": -1 });

// Create user for the application
db.createUser({
  user: "storygeek_app",
  pwd: "StoryAppPass_9Jq-pLm5sRzYtW2_K",
  roles: [
    {
      role: "readWrite",
      db: "storygeek"
    }
  ]
});

print("StoryGeek database initialized successfully!");