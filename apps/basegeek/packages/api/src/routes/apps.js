import express from 'express';
import App from '../models/App.js';
import logger from '../lib/logger.js';
import { requireAdmin } from '../middleware/auth.js';
import { seedMissingApps } from '../services/appRegistrySeed.js';

const router = express.Router();

// The app registry is deliberately split down the middle:
//
//   reads  — public. Nothing here is secret: display name, icon, colour, tag
//            and a public `https://*.clintgeek.com` URL — the same directory
//            the public Portal already prints. The public health proxy
//            (`/api/health/app/:name`) resolves an app's base URL out of this
//            same collection server-side, so its contents already reach
//            unauthenticated callers by another door. (The only in-repo HTTP
//            caller today is basegeek's own authenticated home page; the
//            Portal renders a hardcoded list. See DOCS/AUTH_SYSTEM.md.)
//   writes — admin only. Creating, renaming, disabling or deleting an app —
//            or re-seeding the defaults — rewrites what every consumer of the
//            registry believes the suite *is*, including the URL the health
//            proxy will happily fetch server-side. That is an administrative
//            act, and until 2026-09-03 it took no credentials at all.
//
// See DOCS/AUTH_SYSTEM.md (Roles).

// GET /api/apps — list all enabled apps (sorted) [public]
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

// GET /api/apps/:name — get single app by name [public]
router.get('/:name', async (req, res) => {
  try {
    const app = await App.findOne({ name: req.params.name.toLowerCase() });
    if (!app) return res.status(404).json({ message: 'App not found' });
    res.json({ app });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching app', error: err.message });
  }
});

// POST /api/apps — create a new app [admin]
router.post('/', requireAdmin, async (req, res) => {
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

// PUT /api/apps/:name — update an app [admin]
router.put('/:name', requireAdmin, async (req, res) => {
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

// DELETE /api/apps/:name — delete an app [admin]
router.delete('/:name', requireAdmin, async (req, res) => {
  try {
    const app = await App.findOneAndDelete({ name: req.params.name.toLowerCase() });
    if (!app) return res.status(404).json({ message: 'App not found' });
    res.json({ message: 'App deleted', app });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting app', error: err.message });
  }
});

// POST /api/apps/seed — seed default apps (idempotent) [admin]
// The default list and the create-if-missing logic live in
// services/appRegistrySeed.js — the same function backs the automatic boot
// seed in server.js, so this endpoint and the startup path can never drift.
router.post('/seed', requireAdmin, async (req, res) => {
  try {
    const { created, skipped } = await seedMissingApps();
    res.json({ message: `Seed complete: ${created} created, ${skipped} already existed` });
  } catch (err) {
    res.status(500).json({ message: 'Error seeding apps', error: err.message });
  }
});

export default router;
