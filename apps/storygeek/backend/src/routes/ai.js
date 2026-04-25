import express from 'express';
import axios from 'axios';

const router = express.Router();
const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

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
