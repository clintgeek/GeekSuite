import express from 'express';
import axios from 'axios';
import aiService from '../services/aiService.js';

const router = express.Router();
const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

// The pinned Game Master model — the frontend defaults its picker to this.
router.get('/gm-config', (req, res) => {
  res.json(aiService.getGMConfig());
});

router.get('/providers', async (req, res) => {
  try {
    const response = await axios.get(`${BASEGEEK_URL}/api/ai/providers`, {
      headers: { Cookie: req.headers.cookie || '' },
    });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    return res.status(status).json(err.response?.data || { error: 'Failed to fetch providers' });
  }
});

router.get('/director/models', async (req, res) => {
  try {
    const response = await axios.get(`${BASEGEEK_URL}/api/ai/director/models`, {
      headers: { Cookie: req.headers.cookie || '' },
    });
    return res.status(response.status).json(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    return res.status(status).json(err.response?.data || { error: 'Failed to fetch models' });
  }
});

export default router;
