import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Template from '../models/templateModel.js';
import User from '../models/userModel.js';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local in the server root
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Suppress strictQuery warning
mongoose.set('strictQuery', false);

const createSystemUser = async () => {
  try {
    // Check if system user exists
    let systemUser = await User.findOne({ email: 'system@bujogeek.local' });

    if (!systemUser) {
      systemUser = await User.create({
        name: 'System',
        email: 'system@bujogeek.local',
        password: 'system-' + Date.now(), // Random password since we won't use it
        isSystem: true
      });
      console.log('Created system user');
    } else {
      console.log('System user already exists');
    }

    return systemUser;
  } catch (error) {
    console.error('Error creating system user:', error);
    throw error;
  }
};

const defaultTemplates = [
  {
    name: 'Daily Log',
    description: 'A template for daily journaling and task tracking',
    content: `# Daily Log - {{date}}

## Tasks
- [ ]
- [ ]
- [ ]

## Notes
-

## Reflection
- What went well today?
- What could be improved?
- What am I grateful for?`,
    type: 'daily',
    tags: ['daily', 'productivity', 'reflection'],
    isPublic: true
  },
  {
    name: 'Meeting Notes',
    description: 'Template for structured meeting notes',
    content: `# {{meeting_title}} - {{date}}

## Attendees
- {{attendees}}

## Agenda
1.
2.
3.

## Discussion Points
-

## Action Items
- [ ]
- [ ]

## Next Steps
- `,
    type: 'meeting',
    tags: ['meeting', 'work', 'notes'],
    isPublic: true
  },
  {
    name: 'Weekly Review',
    description: 'Template for weekly planning and review',
    content: `# Weekly Review - Week of {{start_date}}

## Accomplishments
-

## Challenges
-

## Next Week's Goals
1.
2.
3.

## Focus Areas
-

## Notes
- `,
    type: 'weekly',
    tags: ['weekly', 'planning', 'review'],
    isPublic: true
  }
];

const seedTemplates = async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Create system user
    const systemUser = await createSystemUser();

    // Clear existing templates
    await Template.deleteMany({});
    console.log('Cleared existing templates');

    // Add system user ID to all templates
    const templatesWithUser = defaultTemplates.map(template => ({
      ...template,
      createdBy: systemUser._id
    }));

    // Insert default templates
    const templates = await Template.insertMany(templatesWithUser);
    console.log('Inserted default templates:', templates.length);

    console.log('Seeding completed successfully');
  } catch (error) {
    console.error('Error seeding templates:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the seeding
seedTemplates();