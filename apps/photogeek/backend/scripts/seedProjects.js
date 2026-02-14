const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Project = require('../src/models/Project');
const projectsData = require('../data/projects.json');

// Load environment variables
dotenv.config();

const seedProjects = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');

    // Clear existing projects
    await Project.deleteMany({});
    console.log('Cleared existing projects');

    // Insert new projects
    const projects = await Project.insertMany(projectsData);
    console.log(`✅ ${ projects.length } projects seeded successfully!`);

    // Display seeded projects
    projects.forEach((project, index) => {
      console.log(`${ index + 1 }. ${ project.title } (${ project.difficulty })`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding projects:', error);
    process.exit(1);
  }
};

seedProjects();
