#!/usr/bin/env node

require('../src/config/config');
const connectDB = require('../src/config/mongo');
const Lesson = require('../src/models/Lesson');

async function checkLessonMedia() {
  try {
    await connectDB();

    // Find a lesson with media fields
    const lessonWithMedia = await Lesson.findOne({
      $or: [
        { imageUrl: { $exists: true, $ne: null } },
        { videoUrl: { $exists: true, $ne: null } },
        { audioUrl: { $exists: true, $ne: null } },
      ],
    }).lean();

    console.log('\n=== Lesson with Media ===');
    if (lessonWithMedia) {
      console.log('Title:', lessonWithMedia.title);
      console.log('ImageUrl:', lessonWithMedia.imageUrl);
      console.log('VideoUrl:', lessonWithMedia.videoUrl);
      console.log('AudioUrl:', lessonWithMedia.audioUrl);

      if (lessonWithMedia.steps && lessonWithMedia.steps.length > 0) {
        console.log('\n=== First Step ===');
        const step = lessonWithMedia.steps[0];
        console.log('Step type:', step.type);
        console.log('Step imageUrl:', step.imageUrl);
        console.log('Step videoUrl:', step.videoUrl);
        console.log('Step audioUrl:', step.audioUrl);
      }
    } else {
      console.log('No lessons found with media fields');
    }

    // Check the guitar-welcome lesson
    console.log('\n=== Guitar Welcome Lesson ===');
    const welcomeLesson = await Lesson.findOne({ slug: 'guitar-welcome' }).lean();
    if (welcomeLesson) {
      console.log('Title:', welcomeLesson.title);
      console.log('Has template:', !!welcomeLesson.template);
      console.log('Has content:', !!welcomeLesson.content);
      console.log('ImageUrl:', welcomeLesson.imageUrl);
      console.log('VideoUrl:', welcomeLesson.videoUrl);
    } else {
      console.log('Guitar welcome lesson not found');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkLessonMedia();
