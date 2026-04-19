import express from 'express';
import App from '../models/App.js';
import logger from '../lib/logger.js';

const router = express.Router();

// GET /api/apps — list all enabled apps (sorted)
router.get('/', async (req, res) => {
  try {
    const includeDisabled = req.query.all === 'true';
    const filter = includeDisabled ? {} : { enabled: true };
    const apps = await App.find(filter).sort({ sortOrder: 1, name: 1 });
    res.json({ apps });
  } catch (err) {
    req.log.error({ err }, 'Error fetching apps');
    res.status(500).json({ message: 'Error fetching apps', error: err.message });
  }
});

// GET /api/apps/:name — get single app by name
router.get('/:name', async (req, res) => {
  try {
    const app = await App.findOne({ name: req.params.name.toLowerCase() });
    if (!app) return res.status(404).json({ message: 'App not found' });
    res.json({ app });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching app', error: err.message });
  }
});

// POST /api/apps — create a new app
router.post('/', async (req, res) => {
  try {
    const { name, displayName, description, icon, color, url, healthEndpoint, enabled, tag, sortOrder } = req.body;
    const app = new App({ name, displayName, description, icon, color, url, healthEndpoint, enabled, tag, sortOrder });
    await app.save();
    res.status(201).json({ app });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'App with this name already exists' });
    }
    res.status(500).json({ message: 'Error creating app', error: err.message });
  }
});

// PUT /api/apps/:name — update an app
router.put('/:name', async (req, res) => {
  try {
    const app = await App.findOneAndUpdate(
      { name: req.params.name.toLowerCase() },
      req.body,
      { new: true, runValidators: true }
    );
    if (!app) return res.status(404).json({ message: 'App not found' });
    res.json({ app });
  } catch (err) {
    res.status(500).json({ message: 'Error updating app', error: err.message });
  }
});

// DELETE /api/apps/:name — delete an app
router.delete('/:name', async (req, res) => {
  try {
    const app = await App.findOneAndDelete({ name: req.params.name.toLowerCase() });
    if (!app) return res.status(404).json({ message: 'App not found' });
    res.json({ message: 'App deleted', app });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting app', error: err.message });
  }
});

// POST /api/apps/seed — seed default apps (idempotent)
router.post('/seed', async (req, res) => {
  const defaults = [
    { name: 'basegeek', displayName: 'baseGeek', description: 'Auth & shared services', icon: 'Dashboard', color: '#e8a849', url: 'https://basegeek.clintgeek.com', tag: 'platform', sortOrder: 0 },
    { name: 'notegeek', displayName: 'noteGeek', description: 'Notes & documents', icon: 'Note', color: '#a99df0', url: 'https://notegeek.clintgeek.com', tag: 'productivity', sortOrder: 1 },
    { name: 'bujogeek', displayName: 'bujoGeek', description: 'Bullet journal & tasks', icon: 'Book', color: '#d4956a', url: 'https://bujogeek.clintgeek.com', tag: 'productivity', sortOrder: 2 },
    { name: 'fitnessgeek', displayName: 'fitnessGeek', description: 'Nutrition & fitness', icon: 'FitnessCenter', color: '#7dac8e', url: 'https://fitnessgeek.clintgeek.com', tag: 'health', sortOrder: 3 },
    { name: 'storygeek', displayName: 'storyGeek', description: 'Story plotting & writing', icon: 'AutoStories', color: '#c76b8e', url: 'https://storygeek.clintgeek.com', tag: 'creative', sortOrder: 4 },
    { name: 'flockgeek', displayName: 'flockGeek', description: 'Flock management', icon: 'NatureOutlined', color: '#7dac8e', url: 'https://flockgeek.clintgeek.com', tag: 'management', sortOrder: 5 },
    { name: 'babelgeek', displayName: 'babelGeek', description: 'Translation & language', icon: 'Translate', color: '#6db5c0', url: 'https://babelgeek.clintgeek.com', tag: 'learning', sortOrder: 6 },
  ];

  try {
    let created = 0;
    let skipped = 0;
    for (const appData of defaults) {
      const exists = await App.findOne({ name: appData.name });
      if (exists) {
        skipped++;
      } else {
        await App.create(appData);
        created++;
      }
    }
    res.json({ message: `Seed complete: ${created} created, ${skipped} already existed` });
  } catch (err) {
    res.status(500).json({ message: 'Error seeding apps', error: err.message });
  }
});

export default router;
