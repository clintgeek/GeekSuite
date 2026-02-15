import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Template from '../models/Template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const sampleTemplates = [
  {
    name: "Daily Log Template",
    description: "A basic template for daily journaling and task tracking",
    type: "daily",
    content: `# Daily Log - {{date}}

## Tasks
- [ ]
- [ ]
- [ ]

## Notes
-

## Reflection
- Mood:
- Energy Level:
- Key Accomplishments:`,
    isDefault: true,
    isPublic: true,
    tags: ["daily", "productivity", "reflection"],
    variables: [
      {
        name: "date",
        type: "date",
        defaultValue: "",
        required: true
      }
    ],
    createdBy: new mongoose.Types.ObjectId() // Placeholder user ID
  },
  {
    name: "Meeting Notes Template",
    description: "Template for structured meeting notes",
    type: "meeting",
    content: `# Meeting: {{meetingTitle}}
Date: {{date}}
Attendees: {{attendees}}

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
    isDefault: true,
    isPublic: true,
    tags: ["meeting", "professional", "notes"],
    variables: [
      {
        name: "meetingTitle",
        type: "text",
        defaultValue: "",
        required: true
      },
      {
        name: "date",
        type: "date",
        defaultValue: "",
        required: true
      },
      {
        name: "attendees",
        type: "text",
        defaultValue: "",
        required: true
      }
    ],
    createdBy: new mongoose.Types.ObjectId() // Placeholder user ID
  }
];

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');

    // Clear existing templates
    await Template.deleteMany({});
    console.log('Cleared existing templates');

    // Insert sample templates
    await Template.insertMany(sampleTemplates);
    console.log('Sample templates inserted successfully');

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

connectDB();