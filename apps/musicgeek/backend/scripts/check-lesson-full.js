#!/usr/bin/env node

require('../src/config/config');
const connectDB = require('../src/config/mongo');
const Lesson = require('../src/models/Lesson');

async function checkLesson() {
  try {
    await connectDB();

    const lesson = await Lesson.findOne({ slug: 'guitar-welcome' }).lean();
    console.log(JSON.stringify(lesson, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkLesson();
